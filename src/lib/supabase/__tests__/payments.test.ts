// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSchemaTestDb, makeRoleRunners } from "./harness";

/**
 * 결제 이행의 DB 왕복 — M4의 게이트를 실제 Postgres에서 확인합니다.
 *
 * 게이트: **승인은 됐는데 구매 기록이 없는 상태가 재현되지 않는다.**
 *
 * 그 상태는 세 갈래로 생깁니다.
 *   1. 이행 도중에 끊긴다        → 한 트랜잭션이므로 전부 아니면 전무
 *   2. 같은 승인이 두 번 들어온다 → 두 번째는 already_fulfilled
 *   3. 이미 산 책을 또 산다       → duplicate_purchase, 아무것도 바꾸지 않음
 *
 * 여기서는 RPC만 봅니다. Toss와 주고받는 부분(승인 재확인, 취소 보상)은
 * `lib/payments/fulfillment.test.ts`가 봅니다.
 *
 * 그리고 재구성 이전부터 열려 있던 구멍 하나를 함께 고정합니다 —
 * 로그인한 사용자가 **자기 이름으로** purchases 행을 넣어 유료 책을
 * 여는 경로입니다. M1은 남의 이름으로 넣는 것만 막았습니다.
 */

let db: PGlite;
let asUser: <T>(userId: string, run: () => Promise<T>) => Promise<T>;
let asAnon: <T>(run: () => Promise<T>) => Promise<T>;

let creator: string;
let reader: string;
let other: string;
let paidBook: string;

const PRICE = 9900;

// ------------------------------------------------------------
// 픽스처
// ------------------------------------------------------------

async function seedUser(email: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
    [email],
  );
  return result.rows[0].id;
}

/**
 * 결제 행은 서버가 create_payment_request로 만듭니다(00005). 테스트도
 * 같은 자리로 심어야 금액을 정하는 규칙이 바뀔 때 함께 깨집니다.
 */
async function seedTransaction(
  orderId: string,
  options: { user?: string } = {},
): Promise<string> {
  const result = await requestPayment(orderId, options.user ?? reader);
  if (result.outcome !== "created" || !result.transaction_id) {
    throw new Error(`결제 행을 심지 못했습니다: ${result.outcome}`);
  }
  return result.transaction_id;
}

interface RequestResult {
  outcome: string;
  transaction_id?: string;
  amount?: number;
  title?: string;
}

async function requestPayment(
  orderId: string,
  userId = reader,
  bookId = paidBook,
): Promise<RequestResult> {
  const result = await db.query<{ r: RequestResult }>(
    `SELECT create_payment_request($1, $2, $3) AS r`,
    [userId, bookId, orderId],
  );
  return result.rows[0].r;
}

interface FulfillResult {
  outcome:
    | "granted"
    | "restored"
    | "already_fulfilled"
    | "duplicate_purchase"
    | "voided";
  status?: string;
  purchase_id: string | null;
  book_id: string;
  user_id: string;
}

/** 서버가 admin 클라이언트로 부르는 것과 같은 자리 — 기본 롤로 실행합니다. */
async function fulfill(
  orderId: string,
  options: { paymentKey?: string; amount?: number; method?: string } = {},
): Promise<FulfillResult> {
  const result = await db.query<{ fulfill_payment: FulfillResult }>(
    `SELECT fulfill_payment($1, $2, $3::integer, $4, $5::jsonb) AS fulfill_payment`,
    [
      orderId,
      options.paymentKey ?? `key_${orderId}`,
      options.amount ?? PRICE,
      options.method ?? "카드",
      JSON.stringify({ status: "DONE", orderId }),
    ],
  );
  return result.rows[0].fulfill_payment;
}

async function voidPayment(orderId: string, status: string) {
  const result = await db.query<{ void_payment: { outcome: string; revoked: boolean } }>(
    `SELECT void_payment($1, $2) AS void_payment`,
    [orderId, status],
  );
  return result.rows[0].void_payment;
}

async function countPurchases(userId = reader): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM purchases WHERE user_id = $1 AND book_id = $2`,
    [userId, paidBook],
  );
  return Number(result.rows[0].count);
}

async function transactionRow(orderId: string) {
  const result = await db.query<{
    status: string;
    purchase_id: string | null;
    toss_payment_key: string | null;
    method: string | null;
  }>(
    `SELECT status, purchase_id, toss_payment_key, method
       FROM payment_transactions WHERE toss_order_id = $1`,
    [orderId],
  );
  return result.rows[0];
}

/** 리더가 실제로 열리는지는 이 함수가 정합니다. */
async function hasAccess(userId: string): Promise<boolean> {
  return asUser(userId, async () => {
    const result = await db.query<{ ok: boolean }>(
      `SELECT has_book_access($1) AS ok`,
      [paidBook],
    );
    return result.rows[0].ok;
  });
}

beforeAll(async () => {
  db = await createSchemaTestDb();
  ({ asUser, asAnon } = makeRoleRunners(db));
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    DELETE FROM payment_transactions;
    DELETE FROM purchases;
    DELETE FROM books;
    DELETE FROM auth.users;
  `);

  creator = await seedUser("creator@test.com");
  reader = await seedUser("reader@test.com");
  other = await seedUser("other@test.com");

  const book = await db.query<{ id: string }>(
    `INSERT INTO books (owner_id, title, price, status, visibility)
     VALUES ($1, '유료 워크북', $2, 'published', 'public') RETURNING id`,
    [creator, PRICE],
  );
  paidBook = book.rows[0].id;
});

// ------------------------------------------------------------
// 성공
// ------------------------------------------------------------

describe("승인 반영", () => {
  it("구매를 만들고 결제 행에 연결한다", async () => {
    await seedTransaction("order-1");

    const result = await fulfill("order-1");

    expect(result.outcome).toBe("granted");
    expect(result.user_id).toBe(reader);
    expect(result.book_id).toBe(paidBook);

    const tx = await transactionRow("order-1");
    expect(tx.status).toBe("done");
    expect(tx.purchase_id).toBe(result.purchase_id);
    expect(tx.toss_payment_key).toBe("key_order-1");
    expect(tx.method).toBe("카드");
  });

  it("이행하면 그 사용자에게만 책이 열린다", async () => {
    await seedTransaction("order-1");

    expect(await hasAccess(reader)).toBe(false);
    await fulfill("order-1");
    expect(await hasAccess(reader)).toBe(true);
    expect(await hasAccess(other)).toBe(false);
  });

  it("결제 행이 없으면 던진다 — 아무 주문번호로나 책을 열 수 없다", async () => {
    await expect(fulfill("order-없음")).rejects.toThrow();
    expect(await countPurchases()).toBe(0);
  });
});

// ------------------------------------------------------------
// 중복 — 게이트의 4개 시나리오 중 하나
// ------------------------------------------------------------

describe("중복 호출", () => {
  it("같은 주문을 두 번 이행해도 구매는 하나다", async () => {
    await seedTransaction("order-1");

    const first = await fulfill("order-1");
    const second = await fulfill("order-1");

    expect(first.outcome).toBe("granted");
    expect(second.outcome).toBe("already_fulfilled");
    expect(second.purchase_id).toBe(first.purchase_id);
    expect(await countPurchases()).toBe(1);
  });

  it("두 번째 이행이 구매 시각을 밀지 않는다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");

    const before = await db.query<{ purchased_at: Date }>(
      `SELECT purchased_at FROM purchases WHERE user_id = $1`,
      [reader],
    );
    await fulfill("order-1");
    const after = await db.query<{ purchased_at: Date }>(
      `SELECT purchased_at FROM purchases WHERE user_id = $1`,
      [reader],
    );

    expect(after.rows[0].purchased_at).toEqual(before.rows[0].purchased_at);
  });

  it("다른 결제로 같은 책을 또 사면 duplicate_purchase이고 아무것도 바꾸지 않는다", async () => {
    await seedTransaction("order-1");
    await seedTransaction("order-2");

    const first = await fulfill("order-1");
    const second = await fulfill("order-2");

    expect(second.outcome).toBe("duplicate_purchase");
    // 기존 구매를 가리켜 호출자가 "이미 보유"를 안내할 수 있게 합니다.
    expect(second.purchase_id).toBe(first.purchase_id);
    expect(await countPurchases()).toBe(1);

    // 두 번째 결제 행은 손대지 않습니다 — 취소는 호출자가 Toss에
    // 요청한 뒤 void_payment로 반영합니다.
    const tx = await transactionRow("order-2");
    expect(tx.status).toBe("ready");
    expect(tx.purchase_id).toBeNull();
  });
});

// ------------------------------------------------------------
// 검증 — 금액과 결제 키
// ------------------------------------------------------------

describe("승인 내용 검증", () => {
  it("승인 금액이 요청 시점과 다르면 던진다", async () => {
    await seedTransaction("order-1");

    await expect(fulfill("order-1", { amount: 100 })).rejects.toThrow();
    expect(await countPurchases()).toBe(0);
  });

  it("같은 주문에 다른 결제 키가 오면 던진다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1", { paymentKey: "key-A" });

    await expect(
      fulfill("order-1", { paymentKey: "key-B" }),
    ).rejects.toThrow();
  });
});

// ------------------------------------------------------------
// 창닫음 — confirm 없이 webhook만 들어온 경우
// ------------------------------------------------------------

describe("승인 직후 창을 닫은 경우", () => {
  it("webhook 경로로만 이행해도 결과가 같다", async () => {
    // confirm이 한 번도 불리지 않아 결제 행은 ready 그대로입니다.
    await seedTransaction("order-1");
    expect((await transactionRow("order-1")).status).toBe("ready");

    const result = await fulfill("order-1");

    expect(result.outcome).toBe("granted");
    expect(await hasAccess(reader)).toBe(true);
  });

  it("뒤늦게 돌아온 confirm이 webhook의 이행을 덮지 않는다", async () => {
    await seedTransaction("order-1");

    const viaWebhook = await fulfill("order-1");
    const viaConfirm = await fulfill("order-1");

    expect(viaConfirm.outcome).toBe("already_fulfilled");
    expect(viaConfirm.purchase_id).toBe(viaWebhook.purchase_id);
    expect(await countPurchases()).toBe(1);
  });
});

// ------------------------------------------------------------
// 취소와 재구매
// ------------------------------------------------------------

describe("취소", () => {
  it("취소하면 열려 있던 책이 닫힌다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");
    expect(await hasAccess(reader)).toBe(true);

    const result = await voidPayment("order-1", "canceled");

    expect(result.revoked).toBe(true);
    expect(await hasAccess(reader)).toBe(false);
    expect((await transactionRow("order-1")).status).toBe("canceled");
  });

  it("구매 행은 남긴다 — 무엇이 있었는지 지우지 않는다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");
    await voidPayment("order-1", "canceled");

    const result = await db.query<{ status: string }>(
      `SELECT status FROM purchases WHERE user_id = $1`,
      [reader],
    );
    expect(result.rows[0].status).toBe("refunded");
  });

  it("부분 취소는 접근을 유지한다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");

    const result = await voidPayment("order-1", "partial_canceled");

    expect(result.revoked).toBe(false);
    expect(await hasAccess(reader)).toBe(true);
  });

  it("승인 전에 죽은 결제는 되돌릴 구매가 없다", async () => {
    await seedTransaction("order-1");

    const result = await voidPayment("order-1", "aborted");

    expect(result.revoked).toBe(false);
    expect((await transactionRow("order-1")).status).toBe("aborted");
  });

  it("취소 상태가 아닌 값으로는 부를 수 없다", async () => {
    await seedTransaction("order-1");
    await expect(voidPayment("order-1", "done")).rejects.toThrow();
  });

  it("환불한 책을 다시 살 수 있다 — UNIQUE에 막히지 않는다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");
    await voidPayment("order-1", "canceled");
    expect(await hasAccess(reader)).toBe(false);

    await seedTransaction("order-2");
    const result = await fulfill("order-2");

    expect(result.outcome).toBe("granted");
    expect(await countPurchases()).toBe(1);
    expect(await hasAccess(reader)).toBe(true);
  });
});

// ------------------------------------------------------------
// 권한 — 구매 기록을 만들 수 있는 것은 서버뿐
// ------------------------------------------------------------

describe("구매 기록 생성 경로", () => {
  it("자기 이름으로도 구매 기록을 만들 수 없다 — 무료 열람 우회를 막는다", async () => {
    // M1은 남의 이름으로 넣는 것만 막았습니다. 자기 이름은 통과했고,
    // has_book_access가 purchases를 보므로 유료 책이 그대로 열렸습니다.
    await expect(
      asUser(reader, () =>
        db.query(
          `INSERT INTO purchases (user_id, book_id, price_paid, status)
           VALUES ($1, $2, 0, 'completed')`,
          [reader, paidBook],
        ),
      ),
    ).rejects.toThrow();

    expect(await hasAccess(reader)).toBe(false);
  });

  it("남의 이름으로도 만들 수 없다", async () => {
    await expect(
      asUser(reader, () =>
        db.query(
          `INSERT INTO purchases (user_id, book_id, price_paid, status)
           VALUES ($1, $2, 0, 'completed')`,
          [other, paidBook],
        ),
      ),
    ).rejects.toThrow();
  });

  it("로그인 사용자는 fulfill_payment를 실행할 수 없다", async () => {
    await seedTransaction("order-1");

    await expect(
      asUser(reader, () =>
        db.query(
          `SELECT fulfill_payment('order-1', 'key', $1::integer, '카드', '{}'::jsonb)`,
          [PRICE],
        ),
      ),
    ).rejects.toThrow();

    expect(await countPurchases()).toBe(0);
  });

  it("비로그인도 fulfill_payment를 실행할 수 없다", async () => {
    await seedTransaction("order-1");

    await expect(
      asAnon(() =>
        db.query(
          `SELECT fulfill_payment('order-1', 'key', $1::integer, '카드', '{}'::jsonb)`,
          [PRICE],
        ),
      ),
    ).rejects.toThrow();
  });

  it("로그인 사용자는 void_payment로 남의 결제를 되돌릴 수 없다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");

    await expect(
      asUser(other, () =>
        db.query(`SELECT void_payment('order-1', 'canceled')`),
      ),
    ).rejects.toThrow();

    expect(await hasAccess(reader)).toBe(true);
  });

  it("결제 행을 스스로 done으로 바꿀 수 없다", async () => {
    await seedTransaction("order-1");

    await asUser(reader, () =>
      db.query(
        `UPDATE payment_transactions SET status = 'done' WHERE toss_order_id = 'order-1'`,
      ),
    );

    // UPDATE 정책이 없으므로 0행이 바뀝니다 (에러가 아니라 조용한 무시).
    expect((await transactionRow("order-1")).status).toBe("ready");
  });
});

// ------------------------------------------------------------
// 결제 요청 — 결제 행은 서버 RPC로만, 금액은 책 가격에서 (00005)
// ------------------------------------------------------------

describe("결제 요청", () => {
  it("금액은 책 가격에서 정한다", async () => {
    const result = await requestPayment("order-1");

    expect(result).toMatchObject({ outcome: "created", amount: PRICE, title: "유료 워크북" });
    const row = await db.query<{ amount: number; status: string; user_id: string }>(
      `SELECT amount, status, user_id FROM payment_transactions WHERE toss_order_id = 'order-1'`,
    );
    expect(row.rows[0]).toEqual({ amount: PRICE, status: "ready", user_id: reader });
  });

  it("팔 수 없는 책에는 결제 행을 만들지 않는다", async () => {
    const privateBook = await db.query<{ id: string }>(
      `INSERT INTO books (owner_id, title, price, status, visibility)
       VALUES ($1, '비공개', $2, 'published', 'private') RETURNING id`,
      [creator, PRICE],
    );
    const freeBook = await db.query<{ id: string }>(
      `INSERT INTO books (owner_id, title, price, status, visibility)
       VALUES ($1, '무료', 0, 'published', 'public') RETURNING id`,
      [creator],
    );

    expect((await requestPayment("o-1", reader, privateBook.rows[0].id)).outcome).toBe("not_for_sale");
    expect((await requestPayment("o-2", reader, freeBook.rows[0].id)).outcome).toBe("free");
    expect((await requestPayment("o-3", creator)).outcome).toBe("own_book");
    expect(
      (await requestPayment("o-4", reader, "00000000-0000-4000-8000-000000000000")).outcome,
    ).toBe("not_found");

    const rows = await db.query(`SELECT 1 FROM payment_transactions`);
    expect(rows.rows).toHaveLength(0);
  });

  it("이미 산 책에는 결제 행을 만들지 않는다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");

    expect((await requestPayment("order-2")).outcome).toBe("already_owned");
  });

  it("비로그인은 create_payment_request를 실행할 수 없다", async () => {
    await expect(
      asAnon(() =>
        db.query(`SELECT create_payment_request($1, $2, 'order-anon')`, [reader, paidBook]),
      ),
    ).rejects.toThrow();
  });
});

// ------------------------------------------------------------
// 재구매와 옛 결제 (1-P0-2, 2-P0-2)
// ------------------------------------------------------------

describe("재구매 뒤 옛 결제", () => {
  async function refundThenRebuy() {
    await seedTransaction("order-1");
    await fulfill("order-1");
    await voidPayment("order-1", "canceled");
    await seedTransaction("order-2");
    await fulfill("order-2");
    expect(await hasAccess(reader)).toBe(true);
  }

  it("옛 결제의 취소 webhook이 다시 와도 재구매한 책이 닫히지 않는다", async () => {
    await refundThenRebuy();

    const result = await voidPayment("order-1", "canceled");

    expect(result.revoked).toBe(false);
    expect(await hasAccess(reader)).toBe(true);
  });

  it("구매는 마지막으로 이행한 결제를 가리킨다", async () => {
    await refundThenRebuy();

    const row = await db.query<{ payment_transaction_id: string; tx: string }>(
      `SELECT p.payment_transaction_id,
              (SELECT id FROM payment_transactions WHERE toss_order_id = 'order-2') AS tx
         FROM purchases p WHERE p.user_id = $1`,
      [reader],
    );
    expect(row.rows[0].payment_transaction_id).toBe(row.rows[0].tx);
  });

  it("재구매한 결제가 취소되면 그때는 닫힌다", async () => {
    await refundThenRebuy();

    const result = await voidPayment("order-2", "canceled");

    expect(result.revoked).toBe(true);
    expect(await hasAccess(reader)).toBe(false);
  });

  it("옛 결제의 기록(purchase_id)은 지우지 않는다", async () => {
    await refundThenRebuy();

    expect((await transactionRow("order-1")).purchase_id).not.toBeNull();
  });
});

// ------------------------------------------------------------
// 종결된 결제 행 (2-P0-3)
// ------------------------------------------------------------

describe("종결된 결제 행의 이행", () => {
  it("취소가 먼저 반영된 결제는 이행하지 않는다 — 환불된 결제로 책이 열리지 않는다", async () => {
    // confirm이 Toss에서 DONE을 받은 뒤 RPC를 부르기 전에 취소 webhook이
    // 먼저 반영된 경우입니다.
    await seedTransaction("order-1");
    await voidPayment("order-1", "canceled");

    const result = await fulfill("order-1");

    expect(result.outcome).toBe("voided");
    expect(result.status).toBe("canceled");
    expect(await countPurchases()).toBe(0);
    expect(await hasAccess(reader)).toBe(false);
    // 취소 기록을 done으로 덮지 않습니다.
    expect((await transactionRow("order-1")).status).toBe("canceled");
  });

  it("중단·만료된 결제도 이행하지 않는다", async () => {
    for (const [orderId, status] of [
      ["order-a", "aborted"],
      ["order-e", "expired"],
    ]) {
      await seedTransaction(orderId);
      await voidPayment(orderId, status);

      const result = await fulfill(orderId);

      expect(result.outcome).toBe("voided");
      expect((await transactionRow(orderId)).status).toBe(status);
    }
    expect(await countPurchases()).toBe(0);
  });

  it("부분 취소된 결제는 이미 열린 구매를 유지한다 — already_fulfilled", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");
    await voidPayment("order-1", "partial_canceled");

    const result = await fulfill("order-1");

    expect(result.outcome).toBe("already_fulfilled");
    expect(await hasAccess(reader)).toBe(true);
  });

  it("환불된 결제는 다시 이행해도 열리지 않는다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");
    await voidPayment("order-1", "canceled");

    const result = await fulfill("order-1");

    expect(result.outcome).toBe("voided");
    expect(await hasAccess(reader)).toBe(false);
  });
});

// ------------------------------------------------------------
// 회수된 구매 (1-P0-3)
// ------------------------------------------------------------

describe("승인된 결제의 닫힌 구매", () => {
  it("승인 결제가 가리키는 구매가 닫혀 있으면 되살린다", async () => {
    // 00005 이전의 void_payment가 재구매한 구매를 옛 결제의 취소로
    // 닫았던 상태를 그대로 만듭니다. 결제 행은 done인데 구매는 refunded.
    await seedTransaction("order-1");
    await fulfill("order-1");
    await db.query(`UPDATE purchases SET status = 'refunded' WHERE user_id = $1`, [reader]);
    expect(await hasAccess(reader)).toBe(false);

    const result = await fulfill("order-1");

    expect(result.outcome).toBe("restored");
    expect(await hasAccess(reader)).toBe(true);
    expect(await countPurchases()).toBe(1);
  });

  it("되살린 구매는 이 결제에 묶여, 이 결제가 취소되면 다시 닫힌다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");
    await db.query(
      `UPDATE purchases SET status = 'refunded', payment_transaction_id = NULL WHERE user_id = $1`,
      [reader],
    );
    await fulfill("order-1");

    const result = await voidPayment("order-1", "canceled");

    expect(result.revoked).toBe(true);
    expect(await hasAccess(reader)).toBe(false);
  });
});

// ------------------------------------------------------------
// 승인 실패 오판 (1-P0-1)
// ------------------------------------------------------------

describe("승인 전 상태로 덮기", () => {
  it("승인된 결제 행을 aborted로 덮지 않는다 — 열린 책이 닫히지 않는다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");

    const result = await voidPayment("order-1", "aborted");

    expect(result.outcome).toBe("ignored");
    expect(result.revoked).toBe(false);
    expect((await transactionRow("order-1")).status).toBe("done");
    expect(await hasAccess(reader)).toBe(true);
  });

  it("취소된 결제 행을 expired로 덮지 않는다 — 취소 기록이 남는다", async () => {
    await seedTransaction("order-1");
    await fulfill("order-1");
    await voidPayment("order-1", "canceled");

    const result = await voidPayment("order-1", "expired");

    expect(result.outcome).toBe("ignored");
    expect((await transactionRow("order-1")).status).toBe("canceled");
  });
});
