import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * 임베디드 Postgres에 초기 스키마를 올려 주는 테스트 하네스.
 *
 * Supabase가 프로젝트마다 미리 만들어 두는 것 — `auth` 스키마,
 * `auth.users`, `auth.uid()`, `anon` / `authenticated` 롤과 기본 권한 —
 * 만 흉내 내고 나머지는 마이그레이션 파일이 스스로 만듭니다.
 * 실제 Supabase 프로젝트 적용을 대신하지는 않지만, 문법·제약·정책
 * 오류는 여기서 잡힙니다.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/00001_initial_schema.sql",
);

const SUPABASE_PRELUDE = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;

  GRANT USAGE ON SCHEMA public TO anon, authenticated;

  -- Supabase는 postgres가 public에 만드는 테이블의 권한을 두 롤에 자동으로
  -- 넘깁니다. 그래서 실제 접근 판정은 GRANT가 아니라 RLS가 합니다.
  -- 이 줄이 없으면 권한 단계에서 먼저 막혀 정책을 검증할 수 없습니다.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;

  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;

  CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb
  );

  CREATE FUNCTION auth.uid() RETURNS UUID
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

export async function createSchemaTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_PRELUDE);
  await db.exec(readFileSync(MIGRATION_PATH, "utf8"));
  return db;
}

/**
 * 쿼리를 특정 롤·사용자로 실행합니다.
 *
 * PGlite는 연결이 하나뿐이라 `SET ROLE`로 갈아탑니다. 기본 상태인
 * `postgres`는 테이블 소유자여서 RLS를 우회하므로, 정책이 실제로
 * 무엇을 막는지 보려면 반드시 이 헬퍼를 거쳐야 합니다.
 */
export function makeRoleRunners(db: PGlite) {
  async function asRole<T>(
    role: "anon" | "authenticated",
    userId: string | null,
    run: () => Promise<T>,
  ): Promise<T> {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
      userId ?? "",
    ]);
    await db.exec(`SET ROLE ${role}`);
    try {
      return await run();
    } finally {
      await db.exec("RESET ROLE");
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    }
  }

  return {
    /** 로그인한 사용자로 실행. */
    asUser: <T>(userId: string, run: () => Promise<T>) =>
      asRole("authenticated", userId, run),
    /** 비로그인 방문자로 실행. */
    asAnon: <T>(run: () => Promise<T>) => asRole("anon", null, run),
  };
}
