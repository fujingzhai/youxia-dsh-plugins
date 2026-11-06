#!/bin/bash
# 把各插件目录发到 npm。token 只从钥匙串读取，不写入文件，也不打印。
#
#   ./scripts/publish-npm.sh                 # 发布当前版本尚未在官方源出现的插件
#   ./scripts/publish-npm.sh --dry-run
#   ./scripts/publish-npm.sh dsh-zh-slash
#   ./scripts/publish-npm.sh --status
#
# 合集根是 private，不会发布。本机默认源若是镜像，本脚本仍只写 registry.npmjs.org。

set -euo pipefail

KEYCHAIN_SVC="npm-publish-token"
KEYCHAIN_ACCT="youxia2026"
REGISTRY="https://registry.npmjs.org/"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

get_token() {
  security find-generic-password -s "$KEYCHAIN_SVC" -a "$KEYCHAIN_ACCT" -w 2>/dev/null \
    || { echo "✗ 钥匙串里没有 $KEYCHAIN_SVC / $KEYCHAIN_ACCT" >&2; exit 1; }
}

if [[ "${1:-}" == "--status" ]]; then
  TOKEN="$(get_token)"
  code="$(curl -sS -o /tmp/youxia-npm-whoami -w "%{http_code}" --max-time 15 \
    -H "Authorization: Bearer $TOKEN" "${REGISTRY}-/whoami")"
  echo "whoami HTTP $code"
  python3 -c 'import json; d=json.load(open("/tmp/youxia-npm-whoami")); print("账号:", d.get("username") or d)'
  unset TOKEN
  rm -f /tmp/youxia-npm-whoami
  exit 0
fi

DRY=""
TARGETS=()
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then DRY="--dry-run"
  else TARGETS+=("$arg")
  fi
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  while IFS= read -r dir; do TARGETS+=("$(basename "$dir")"); done \
    < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name 'dsh-*' | sort)
fi

TOKEN="$(get_token)"
published=0
skipped=0

for dir in "${TARGETS[@]}"; do
  pkg_dir="$ROOT/$dir"
  [[ -f "$pkg_dir/package.json" ]] || { echo "✗ 没有 $pkg_dir/package.json" >&2; exit 1; }
  name="$(python3 -c "import json; print(json.load(open('$pkg_dir/package.json'))['name'])")"
  ver="$(python3 -c "import json; print(json.load(open('$pkg_dir/package.json'))['version'])")"
  if [[ -z "$DRY" ]] && npm view "$name@$ver" version --registry "$REGISTRY" >/dev/null 2>&1; then
    echo "· $name@$ver 已在 npm，跳过"
    skipped=$((skipped + 1))
    continue
  fi
  echo "→ $name@$ver  ($dir)"
  (
    cd "$pkg_dir"
    npm publish --registry "$REGISTRY" --access public ${DRY:+$DRY} \
      --//registry.npmjs.org/:_authToken="$TOKEN"
  )
  published=$((published + 1))
done

unset TOKEN
echo "完成：发布 $published，跳过 $skipped"
