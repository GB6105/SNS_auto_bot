// 기둥 정의 + 기둥별 주제 풀 (US-2 입력). PRD §콘텐츠 기둥 / §생성 규칙.
import type { Pillar } from "./types.js";

/** 기둥별 의도/효과 (생성 프롬프트 컨텍스트로 사용) */
export const PILLAR_INTENT: Record<Pillar, { purpose: string; effect: string }> = {
  empathy: { purpose: "ADHD 증상·상황 묘사('이거 내 얘기')", effect: "저장·공유 유발" },
  tip: { purpose: "2분 시작법·복귀 기준 등 바로 쓰는 팁", effect: "유용성·팔로우 동기" },
  before_after: { purpose: "흐릿한 할 일 → 정리된 첫 행동 예시", effect: "제품 가치 노출" },
  build_in_public: { purpose: "제품 만드는 과정 공유", effect: "얼리어답터 모집" },
};

/**
 * 기둥별 주제 풀 (MVP 시드). US-2는 여기서 미사용 우선 결정적 선택.
 * 운영 중 커뮤니티 반응에서 소재를 추출해 보충(PRD §리스크 — 콘텐츠 고갈).
 */
export const TOPIC_POOL: Record<Pillar, string[]> = {
  empathy: [
    "할 일을 다 적어놨는데 어디서 시작할지 몰라 멈춘 순간",
    "마감 전날에야 엔진이 켜지는 나",
    "방금 뭐 하려 했더라, 하고 멈춘 다섯 번째",
    "쉬운 일일수록 자꾸 미루게 되는 이유",
    "알림은 봤는데 손이 안 움직이던 아침",
  ],
  tip: [
    "흐릿한 목표를 '지금 할 첫 행동' 한 줄로 쪼개는 법",
    "2분 안에 끝나면 지금 바로 하기 규칙",
    "끊긴 일로 돌아오는 '복귀 기준' 만들기",
    "할 일 목록 대신 '다음 한 가지'만 보기",
    "타이머 25분이 부담될 때 5분으로 시작하기",
  ],
  before_after: [
    "'방 치우기' → '책상 위 컵 하나 싱크대에 두기'",
    "'운동하기' → '운동화 신고 현관까지 가기'",
    "'이메일 정리' → '안 읽은 메일 맨 위 1개만 열기'",
    "'공부하기' → '교재 펴서 어제 본 페이지 찾기'",
    "'서류 작성' → '문서 열고 제목만 쓰기'",
  ],
  build_in_public: [
    "ADHD인 내가 ADHD 플래너를 만드는 이유",
    "이번 주에 갈아엎은 기능과 그 이유",
    "사용자 한 마디에 설계를 바꾼 이야기",
    "'완성'보다 '계속'을 택한 개발 원칙",
    "혼자 만들며 끊기지 않으려고 쓰는 장치",
  ],
};

/** 인스타 cadence: 요일 → 기둥 (월=공감, 수=실전팁, 금=비포애프터/빌드 격주) */
export const IG_WEEKDAY_PILLAR: Record<number, Pillar | "biweekly"> = {
  1: "empathy", // Monday
  3: "tip", // Wednesday
  5: "biweekly", // Friday: before_after ↔ build_in_public 격주
};

/** 스레드 cadence: 요일 → 톤 (월·목 진지 / 화·금 일상홍보 / 수 질문 / 토·일 공감) */
export const THREAD_WEEKDAY_TONE: Record<number, import("./types.js").ThreadTone> = {
  0: "empathy_short", // Sun
  1: "serious", // Mon
  2: "casual_promo", // Tue
  3: "question", // Wed
  4: "serious", // Thu
  5: "casual_promo", // Fri
  6: "empathy_short", // Sat
};
