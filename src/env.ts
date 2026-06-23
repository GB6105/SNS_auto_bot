// .env 자동 로드 (Node 20.12+ 내장 process.loadEnvFile, 의존성 0).
// 파일이 없으면 조용히 통과한다. 다른 모듈보다 먼저 import 되어야 한다.
try {
  const p = process as unknown as { loadEnvFile?: (path?: string) => void };
  p.loadEnvFile?.(".env");
} catch {
  /* .env 없음 — 환경변수로만 동작 */
}
