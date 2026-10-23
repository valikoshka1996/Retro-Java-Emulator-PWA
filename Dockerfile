# syntax=docker/dockerfile:1
FROM eclipse-temurin:8-jdk-jammy AS java
FROM node:24-bookworm-slim AS build
COPY --from=java /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="/opt/java/openjdk/bin:${PATH}"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run engine:prepare && npm run build

FROM nginx:stable-alpine AS runtime
ARG VCS_REF=local
LABEL org.opencontainers.image.title="Java Retro Emulator PWA" \
      org.opencontainers.image.source="https://github.com/valikoshka1996/Retro-Java-Emulator-PWA" \
      org.opencontainers.image.licenses="GPL-3.0-or-later" \
      org.opencontainers.image.revision="${VCS_REF}" \
      io.java-retro.app="retro-java-emulator-pwa"
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /app/dist/ /usr/share/nginx/html/
COPY LICENSE /usr/share/nginx/html/LICENSE
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=6 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
