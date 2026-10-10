#!/usr/bin/env bash
# Register a self-hosted GitHub Actions runner on this Mac for fork auto-pull.
set -euo pipefail

REPO="${1:?Usage: setup-mac-runner.sh MervinPraison/opencode}"
RUNNER_NAME="${2:-praison-mac-opencode}"
RUNNER_ROOT="$HOME/.github-actions-runners/${REPO##*/}"

latest_version() {
  curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | grep tag_name | cut -d'"' -f4
}

install_runner() {
  local version arch tar url
  version="$(latest_version)"
  version="${version#v}"
  arch="$(uname -m)"
  case "$arch" in
    arm64) tar="actions-runner-osx-arm64-${version}.tar.gz" ;;
    x86_64) tar="actions-runner-osx-x64-${version}.tar.gz" ;;
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
  esac
  url="https://github.com/actions/runner/releases/download/v${version}/${tar}"

  mkdir -p "$RUNNER_ROOT"
  cd "$RUNNER_ROOT"
  if [[ ! -f "./config.sh" ]]; then
    echo "Downloading runner v${version}..."
    curl -fsSL "$url" -o runner.tar.gz
    tar xzf runner.tar.gz
    rm runner.tar.gz
  fi

  token="$(gh api -X POST "repos/${REPO}/actions/runners/registration-token" -q .token)"
  ./config.sh \
    --url "https://github.com/${REPO}" \
    --token "$token" \
    --name "$RUNNER_NAME" \
    --labels "self-hosted,macOS,${arch}" \
    --unattended \
    --replace

  ./svc.sh install
  ./svc.sh start
  gh api -X PATCH "repos/${REPO}/actions/variables/MAC_RUNNER" \
    -f name=MAC_RUNNER -f value=true 2>/dev/null \
    || gh api -X POST "repos/${REPO}/actions/variables" \
      -f name=MAC_RUNNER -f value=true
  echo "Runner ready for ${REPO} (service running, MAC_RUNNER=true)"
}

install_runner
