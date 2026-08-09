#!/usr/bin/env bash
#
# public/fonts/ 의 한글 서브셋을 다시 만듭니다.
#
# 평소에는 돌릴 일이 없습니다. 결과물이 레포에 커밋돼 있고, 빌드는
# 네트워크에 의존하지 않습니다. 커버리지를 넓히거나 폰트를 올릴 때만
# 씁니다.
#
# 필요한 것: curl, fonttools (pip install fonttools)
#
# 왜 서브셋이 필요한가:
#   @react-pdf/renderer는 내장 Helvetica만 쓰면 한글을 Latin-1 한 바이트로
#   뭉개서 엉뚱한 글자를 찍습니다. 원본 Noto Sans KR은 가변 폰트(10.4MB)라
#   react-pdf가 읽지 못하므로, 고정 웨이트로 인스턴스화한 뒤 필요한
#   유니코드만 남깁니다.
#
# 왜 두 파일의 이름이 서로 달라야 하는가:
#   pdfkit이 임베드 폰트를 postscript 이름으로 캐시합니다. 두 웨이트의
#   이름이 같으면 두 번째가 첫 번째로 덮여서 굵은 글씨가 사라집니다.
#   그래서 --update-name-table이 선택이 아니라 필수입니다.

set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/fonts"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

SRC_URL="https://github.com/google/fonts/raw/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf"

# 현대 한글 11,172 음절 전체를 담습니다. 상용 2,350자로 줄여도 용량이
# 2.4MB에서 2.5MB로 거의 차이가 없었고(합자·자모 테이블이 용량의 대부분),
# 독자가 자유서술에 무슨 글자를 쓸지 모르는 이상 빠진 음절이 네모로
# 찍히는 쪽이 훨씬 나쁩니다.
#
# 기호 범위를 넓게 잡습니다. 빠진 글자는 예외 없이 조용히 다른 폰트로
# 새어 나가 엉뚱한 문자로 찍힙니다. 실제로 ✓(U+2713)가 Dingbats
# 블록이라 U+2600-26FF에 안 들어간다는 것을 놓쳐서, 체크한 항목이
# PDF에 'v'로 나온 적이 있습니다. `pdf-fallback-glyphs.test.ts`가
# 내보내기가 쓰는 글자를 하나씩 확인합니다.
UNICODES="U+0020-007E,U+00A0-00FF,U+2000-206F,U+20A9,U+20AC,U+2190-21FF,U+2460-24FF,U+25A0-25FF,U+2600-27BF,U+3000-303F,U+3130-318F,U+AC00-D7A3,U+FF01-FF60"

echo "원본 내려받는 중..."
curl -sSL -o "$WORK_DIR/src.ttf" "$SRC_URL"

build() {
  local weight="$1" name="$2"
  echo "wght=$weight → $name"
  fonttools varLib.instancer "$WORK_DIR/src.ttf" "wght=$weight" \
    --update-name-table -o "$WORK_DIR/inst-$weight.ttf" >/dev/null
  pyftsubset "$WORK_DIR/inst-$weight.ttf" \
    --unicodes="$UNICODES" \
    --layout-features='' \
    --no-hinting \
    --output-file="$OUT_DIR/$name"
}

mkdir -p "$OUT_DIR"
build 400 NotoSansKR-Regular.subset.ttf
build 700 NotoSansKR-Bold.subset.ttf

echo "라이선스 내려받는 중..."
curl -sSL -o "$OUT_DIR/OFL.txt" \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/OFL.txt"

ls -la "$OUT_DIR"
