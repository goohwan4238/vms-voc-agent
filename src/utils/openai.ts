import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeVOC(title: string, description: string) {
  const prompt = `
다음 VOC를 분석하여 개발 관점에서 평가해주세요:

제목: ${title}
내용: ${description}

다음 형식으로 응답해주세요:
1. 요약 (한 문장)
2. 핵심 요구사항 (3개 이내)
3. 예상 개발 공수 (Low/Medium/High/Critical 중 선택)
4. 타 기능 영향도 (관련 모듈/테이블 추정)
5. 리스크 요소
6. 개발 권고 (개발/보류/반려 중 선택)
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  return response.choices[0].message.content;
}

export async function generatePRD(analysis: string, vocData: any) {
  const prompt = `
다음 VOC 분석 결과를 바탕으로 PRD를 작성해주세요:

VOC 제목: ${vocData.title}
분석 결과:
${analysis}

다음 섹션을 포함하여 Markdown 형식으로 작성:
1. 개요
2. 목표
3. 사용자 스토리
4. 기능 명세
5. 타 기능 영향도
6. 기술적 접근 방안
7. 테스트 계획
8. 일정
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  return response.choices[0].message.content;
}
