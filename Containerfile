FROM scratch

LABEL org.opencontainers.image.title="Docker over TCP" \
      org.opencontainers.image.description="Connect Podman Desktop to Docker engines reachable via tcp://" \
      org.opencontainers.image.vendor="gasparovicm" \
      org.opencontainers.image.source="https://github.com/gasparovicm/podman-desktop-docker-tcp" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.podman-desktop.api.version=">= 1.20.0"

COPY package.json extension.js icon.png LICENSE README.md /extension/
