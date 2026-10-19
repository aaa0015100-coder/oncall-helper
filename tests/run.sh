#!/bin/sh
# 用法：sh tests/run.sh [style|batch|full] [--tab=id,...]
#  style：只改外觀 → 靜態＋快照比對（需 tests/snap.txt 為改前版本）＋e2e 快速
#  batch：一般批次 → 靜態＋快照（更新）＋fuzz（組合模擬）＋e2e 快速＋指定分頁完整
#  full ：v1.0 → 靜態＋快照＋e2e --full
cd "$(dirname "$0")/.." || exit 1
MODE=${1:-style}; shift 2>/dev/null
rc=0
node tests/static.js index.html || rc=1
node tests/snap.js index.html tests/snap.new.txt >/dev/null || rc=1
if [ -f tests/snap.txt ]; then
  if diff -q tests/snap.txt tests/snap.new.txt >/dev/null; then echo "SNAP 相同"; else
    echo "SNAP 有差異（style 模式必須相同；batch 模式請確認後覆蓋 snap.txt）："; diff tests/snap.txt tests/snap.new.txt | grep '^[<>]' | cut -c1-200 | head -20
    [ "$MODE" = style ] && rc=1; fi
fi
[ "$MODE" != style ] && { node tests/fuzz.js index.html ${FUZZ_N:-3000} || rc=1; }
case "$MODE" in
  full) python3 tests/e2e.py index.html --full || rc=1;;
  *) python3 tests/e2e.py index.html "$@" || rc=1;;
esac
exit $rc
