"""
자기소개서 템플릿 생성기.

- 입력: SelfIntroInput(roles, competencies, background, language, focus)
- 출력: SelfIntroOutput(reasoning, draft)
- reasoning: 왜 이렇게 구성했는지 설명 문단 (직무/역량/가정 등)
- draft: 실제 자기소개서 본문. focus에 따라 역량/경험/가치관 중심 3종 + 영어 1종.
- LM 체크포인트가 없을 때 서비스 레이어에서 이 모듈을 사용합니다.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional


Language = Literal["ko", "en"]
Focus = Literal["strength", "experience", "values"]


@dataclass
class CandidateBackground:
    """
    지원자 기본 정보 및 경험. adapter에서 ExtractedBackground를 이 형식으로 넘겨줌.
    """

    name: Optional[str] = None
    education: Optional[str] = None  # 예: "컴퓨터공학 전공"
    experiences: Optional[List[str]] = None  # 예: ["데이터 분석 인턴 6개월", "동아리 회장 1년"]
    strengths: Optional[List[str]] = None  # 예: ["문제해결", "커뮤니케이션"]
    career_values: Optional[str] = None  # 상담에서 추출한 가치관 (예: "책임감, 소통, 성장")


@dataclass
class SelfIntroInput:
    """
    자기소개서 생성기의 입력. roles/competencies/background 필수, 나머지는 기본값 있음.
    """

    roles: List[str]  # 추천 직무 (예: ["데이터 분석가"])
    competencies: List[str]  # 직무역량 (예: ["데이터 분석", "문제해결"])
    background: CandidateBackground
    language: Language = "ko"
    min_word_count: int = 600  # 참고용 (템플릿은 고정 분량)
    focus: Focus = "strength"  # strength(역량) | experience(경험) | values(가치관)


@dataclass
class SelfIntroOutput:
    """
    생성기 내부 출력: 추론 문단 + 자기소개서 본문. 서비스에서 SelfIntroResponse로 감쌈.
    """

    reasoning: str  # 직무/역량 매핑, 가정 등 설명
    draft: str  # 자기소개서 본문


# --- 직무/역량 한 줄 설명 (한·영). 프롬프트·reasoning 생성 시 사용 ---
ROLE_SUMMARIES_KO = {
    "데이터 분석가": "데이터 기반 의사결정, 통계 분석, 가설 검증, 비즈니스 인사이트 도출에 강점을 요구하는 직무입니다.",
    "백엔드 개발자": "안정적인 서버 설계, 데이터 모델링, 성능 및 보안에 대한 이해가 중요한 직무입니다.",
    "마케팅 전략가": "시장·고객 데이터를 기반으로 효과적인 캠페인과 브랜딩 전략을 수립하는 직무입니다.",
}

ROLE_SUMMARIES_EN = {
    "Data Analyst": "A role that focuses on data-driven decision making, statistical analysis, hypothesis testing, and business insight generation.",
    "Backend Developer": "A role that requires strong understanding of server architecture, data modeling, performance, and security.",
    "Marketing Strategist": "A role that designs effective campaigns and branding strategies based on market and customer data.",
}

COMPETENCY_SUMMARIES_KO = {
    "데이터 분석": "정량 데이터를 수집·정제·분석하여 의미 있는 인사이트를 도출하는 능력입니다.",
    "문제해결": "복잡한 상황을 구조화하고 원인을 분석하여 실행 가능한 대안을 제시하는 능력입니다.",
    "커뮤니케이션": "다양한 이해관계자와 명확하고 설득력 있게 소통하는 능력입니다.",
    "협업": "팀 내·외부 구성원과 함께 목표를 향해 조율하고 시너지를 내는 능력입니다.",
}

COMPETENCY_SUMMARIES_EN = {
    "Data Analysis": "The ability to collect, clean, and analyze quantitative data to derive meaningful insights.",
    "Problem Solving": "The ability to structure complex situations, analyze root causes, and propose actionable solutions.",
    "Communication": "The ability to communicate clearly and persuasively with diverse stakeholders.",
    "Collaboration": "The ability to align with teammates and create synergy toward shared goals.",
}


def _join_list(items: Optional[List[str]], sep: str = ", ") -> str:
    """리스트를 구분자로 이어 붙인 문자열. None/빈 리스트면 ''."""
    if not items:
        return ""
    return sep.join(items)


def _build_reasoning_ko(input_data: SelfIntroInput) -> str:
    """한국어 reasoning 문단: 직무 설명 + 역량 설명 + 흐름 설계 + (경험/강점 없을 때) 가정 문장."""
    roles = input_data.roles
    comps = input_data.competencies
    bg = input_data.background

    assumptions: List[str] = []
    if not bg.experiences:
        assumptions.append(
            "지원자가 대학 및 인턴십에서 직무와 연관된 프로젝트 경험을 보유하고 있다고 가정했습니다."
        )
    if not bg.strengths:
        assumptions.append(
            "지원자의 강점으로는 추천 역량과 연계된 논리적 사고력과 성실성을 기본적으로 보유하고 있다고 가정했습니다."
        )

    role_sentences: List[str] = []
    for r in roles:
        summary = ROLE_SUMMARIES_KO.get(
            r, f"{r} 직무는 해당 분야에서 전문성을 바탕으로 책임 있는 역할을 수행해야 하는 직무입니다."
        )
        role_sentences.append(summary)

    comp_sentences: List[str] = []
    for c in comps:
        summary = COMPETENCY_SUMMARIES_KO.get(
            c, f"{c} 역량은 해당 직무 환경에서 안정적인 성과를 내기 위해 중요한 능력입니다."
        )
        experience_example = ""
        if bg.experiences:
            experience_example = f" 이 역량은 '{bg.experiences[0]}' 경험을 통해 구체적으로 드러납니다."
        comp_sentences.append(summary + experience_example)

    mapping_overview = (
        "자기소개서에서는 추천된 직무를 중심 축으로 두고, 각 역량을 보여 주는 경험을 상황-과제-행동-결과의 흐름으로 정리하여 "
        "지원자의 적합성과 성장 가능성을 논리적으로 풀어낼 예정입니다."
    )

    parts: List[str] = []
    parts.append(
        "추천된 직무와 역량을 바탕으로 지원자의 배경과 경험을 연결하여 자기소개서의 흐름을 설계했습니다."
    )
    if role_sentences:
        parts.append("직무 관점에서 보면, " + " ".join(role_sentences))
    if comp_sentences:
        parts.append("추천 역량 측면에서는 " + " ".join(comp_sentences))
    parts.append(mapping_overview)
    if assumptions:
        parts.append("추론 및 서술 과정에서 다음과 같은 합리적 가정을 두었습니다: " + " ".join(assumptions))

    return " ".join(parts)


def _build_reasoning_en(input_data: SelfIntroInput) -> str:
    """영어 reasoning 문단. 구조는 _build_reasoning_ko와 동일, 영문 문장."""
    roles = input_data.roles
    comps = input_data.competencies
    bg = input_data.background

    assumptions: List[str] = []
    if not bg.experiences:
        assumptions.append(
            "It is assumed that the candidate has relevant academic or internship projects related to the recommended roles."
        )
    if not bg.strengths:
        assumptions.append(
            "It is assumed that the candidate possesses basic strengths such as logical thinking and diligence aligned with the recommended competencies."
        )

    role_sentences: List[str] = []
    for r in roles:
        summary = ROLE_SUMMARIES_EN.get(
            r, f"The role of {r} generally requires solid expertise and responsibility in the corresponding domain."
        )
        role_sentences.append(summary)

    comp_sentences: List[str] = []
    for c in comps:
        summary = COMPETENCY_SUMMARIES_EN.get(
            c, f"The competency of {c} is essential for producing stable performance in this type of role."
        )
        experience_example = ""
        if bg.experiences:
            experience_example = f" This competency is concretely demonstrated through the experience of '{bg.experiences[0]}'."
        comp_sentences.append(summary + experience_example)

    mapping_overview = (
        "In the self-introduction, the recommended roles will serve as the main axis, while each competency will be illustrated "
        "through concrete episodes following a situation–task–action–result structure to logically highlight the candidate's fit and growth potential."
    )

    parts: List[str] = []
    parts.append(
        "Based on the recommended job roles and competencies, the candidate's background and experiences are mapped to design the flow of the self-introduction essay."
    )
    if role_sentences:
        parts.append("From the perspective of job roles, " + " ".join(role_sentences))
    if comp_sentences:
        parts.append("In terms of competencies, " + " ".join(comp_sentences))
    parts.append(mapping_overview)
    if assumptions:
        parts.append("The following reasonable assumptions were made in the reasoning and narrative: " + " ".join(assumptions))

    return " ".join(parts)


def _build_draft_ko_strength(input_data: SelfIntroInput) -> str:
    """역량 중심 초안: 도입 → 역량 발휘 경험 → 실패/성장 → 학습 체계 → 결론 (한국어)."""
    bg = input_data.background
    roles = _join_list(input_data.roles, ", ")
    comps = _join_list(input_data.competencies, ", ")

    name = bg.name or "지원자"
    education = bg.education or "관련 전공을 기반으로 한 학습 경험"
    experience_example = (
        bg.experiences[0]
        if bg.experiences
        else "대학에서 수행한 팀 프로젝트와 실무에 가까운 과제 경험"
    )
    strengths = _join_list(bg.strengths, ", ") or "논리적 사고와 성실함"

    intro = (
        f"{name}입니다. 저는 {education}을(를) 바탕으로 {roles} 직무에 도전하고자 합니다. "
        f"특히 {comps} 역량을 중심으로 스스로를 성장시켜 왔으며, 이러한 역량이 회사의 문제를 데이터와 논리를 통해 해결하는 데 기여할 수 있다고 믿습니다."
    )

    body_para1 = (
        f"첫째로, 저는 {experience_example}을(를) 수행하면서 {comps} 역량을 실제로 발휘한 경험이 있습니다. "
        f"당시 저는 주어진 상황을 단순히 수행하는 데 그치지 않고, 문제의 구조를 파악하고 핵심 이슈를 정의하는 데 집중했습니다. "
        f"이를 위해 팀 내 구성원들과 적극적으로 커뮤니케이션하며 다양한 관점을 수집했고, 그 과정에서 {strengths}이라는 제 강점이 자연스럽게 드러났습니다. "
        f"이 경험을 통해 단순히 결과만 보는 것이 아니라, 데이터를 기반으로 논리적으로 사고하고 행동하는 방법을 체득할 수 있었습니다."
    )

    body_para2 = (
        f"둘째로, 저는 실패와 한계를 성장의 기회로 바라보며 스스로를 꾸준히 개선해 왔습니다. "
        f"프로젝트를 진행하는 과정에서 초기 가설이 데이터와 맞지 않거나, 팀 내 의사소통이 원활하지 않아 일정이 지연되는 상황도 겪었습니다. "
        f"이때 저는 문제를 숨기기보다는 투명하게 공유하고, 원인을 함께 분석하는 역할을 자처했습니다. "
        f"그 결과, 팀은 일정과 목표를 현실적으로 재조정할 수 있었고, 오히려 더 나은 방향으로 전략을 수정하여 결과물을 개선할 수 있었습니다. "
        f"이 경험은 {comps} 역량이 단순한 스킬을 넘어, 조직 내에서 신뢰를 쌓고 함께 성장하기 위한 태도라는 것을 깨닫게 해 주었습니다."
    )

    body_para3 = (
        f"셋째로, 저는 {roles} 직무가 요구하는 책임감과 전문성을 갖추기 위해 스스로 학습 체계를 만들어 실천해 왔습니다. "
        f"학교 수업과 별도로 온라인 강의와 도서, 실제 데이터셋을 활용해 꾸준히 공부하며, 이론과 실무의 간극을 줄이기 위해 노력했습니다. "
        f"또한 새로운 도구나 방법론을 접할 때마다 단순 사용법을 익히는 데 그치지 않고, 왜 이러한 방식이 효과적인지, 어떤 전제 조건에서 한계가 있는지를 비판적으로 바라보려 했습니다. "
        f"이러한 과정은 저에게 자기 주도적 학습 능력을 길러 주었고, 빠르게 변화하는 환경 속에서도 본질적인 원리를 기반으로 적응할 수 있는 자신감을 주었습니다."
    )

    conclusion = (
        f"앞으로 저는 {roles}로서 {comps} 역량을 바탕으로 조직의 성장을 이끄는 구성원이 되고자 합니다. "
        f"입사 후에는 주어진 업무를 성실히 수행하는 것을 넘어, 데이터를 기반으로 한 인사이트 도출과 문제해결을 통해 팀의 의사결정에 기여하고 싶습니다. "
        f"또한 동료들과의 협업을 통해 서로의 강점을 극대화하고, 끊임없이 배우고 도전하면서 회사와 함께 성장해 나가겠습니다. "
        f"{name}의 이러한 태도와 경험이 귀사에 작은 변화와 가치를 만들어 낼 수 있기를 기대합니다."
    )

    return "\n\n".join([intro, body_para1, body_para2, body_para3, conclusion])


def _build_draft_ko_experience(input_data: SelfIntroInput) -> str:
    """경험 중심 초안: 구체적 에피소드·상황-과제-행동-결과(STAR) 강조 (한국어)."""
    bg = input_data.background
    roles = _join_list(input_data.roles, ", ")
    comps = _join_list(input_data.competencies, ", ")

    name = bg.name or "지원자"
    education = bg.education or "관련 전공을 기반으로 한 학습 경험"
    experience_example = (
        bg.experiences[0]
        if bg.experiences
        else "대학 및 실무에서 수행한 팀 프로젝트와 과제"
    )
    strengths = _join_list(bg.strengths, ", ") or "문제해결과 소통"

    intro = (
        f"{name}입니다. {education}을(를) 바탕으로 {roles} 직무에 지원하며, "
        f"그동안 쌓아온 구체적인 경험을 바탕으로 말씀드립니다."
    )

    body_para1 = (
        f"먼저, {experience_example}과 관련해 말씀드리겠습니다. 당시 저는 상황을 정리하고 목표를 설정한 뒤, "
        f"팀원들과 역할을 나누어 일정을 조율하며 결과물을 완성해 나갔습니다. 그 과정에서 {strengths}을(를) 발휘하게 되었고, "
        f"사용자나 동료의 피드백을 반영해 수정해 나간 경험이 있습니다. 단순히 주어진 일만 하는 것이 아니라, "
        f"문제의 원인을 함께 분석하고 대안을 제시하는 역할을 맡았습니다."
    )

    body_para2 = (
        f"또한 일정이 지연되거나 예상과 다른 결과가 나왔을 때, 원인을 투명하게 공유하고 대안을 모색했던 경험이 있습니다. "
        f"당시 팀이 현실적으로 목표를 재조정하고 전략을 수정할 수 있도록 자료를 정리하고 의견을 나누었고, "
        f"그 결과 더 나은 방향으로 결과물을 개선할 수 있었습니다. 이러한 경험을 통해 {comps} 역량이 실무에서 어떻게 작동하는지 체득했습니다."
    )

    body_para3 = (
        f"그밖에도 {roles} 직무와 연관된 학습과 실습을 꾸준히 해 왔습니다. 온라인 강의, 도서, 실제 데이터나 과제를 활용해 "
        f"이론과 실무의 간극을 줄이려 노력했고, 새로운 도구를 쓸 때에도 왜 효과적인지, 한계는 무엇인지 비판적으로 바라보려 했습니다. "
        f"이러한 경험들이 귀사에서 빠르게 적응하고 기여하는 데 도움이 될 것이라 믿습니다."
    )

    conclusion = (
        f"앞으로 저는 {roles}로서 위와 같은 경험을 바탕으로 팀에 실질적으로 기여하고 싶습니다. "
        f"입사 후에도 구체적인 경험을 나누며 함께 성장하는 구성원이 되겠습니다. 감사합니다."
    )

    return "\n\n".join([intro, body_para1, body_para2, body_para3, conclusion])


def _build_draft_ko_values(input_data: SelfIntroInput) -> str:
    """가치관 중심 초안: 상담에서 추출한 가치관·태도·협업 강조 (한국어)."""
    bg = input_data.background
    roles = _join_list(input_data.roles, ", ")
    comps = _join_list(input_data.competencies, ", ")

    name = bg.name or "지원자"
    values_line = (bg.career_values or "").strip() or "책임감, 소통, 함께 성장하는 것"
    strengths = _join_list(bg.strengths, ", ") or "협업과 문제해결"

    intro = (
        f"함께 성장하는 즐거움을 아는 {name}입니다. "
        f"저의 핵심 가치관은 {values_line}입니다. {roles} 직무에 지원하며, 이러한 가치관을 바탕으로 말씀드립니다."
    )

    body_para1 = (
        f"저는 기술적인 완성도뿐만 아니라 동료와의 원활한 협업을 통해 시너지를 내는 것을 중요하게 생각합니다. "
        f"실제로 팀 프로젝트에서 {strengths}을(를) 살리며, 주어진 역할에 최선을 다하는 동시에 "
        f"주변과 소통해 함께 더 나은 결과를 만드는 것을 지향해 왔습니다."
    )

    body_para2 = (
        f"실패와 한계를 성장의 기회로 바라보며, 피드백을 적극 수용하고 스스로를 개선해 나가는 편입니다. "
        f"문제가 생겼을 때 숨기기보다는 투명하게 공유하고, 원인을 함께 분석하는 역할을 자처해 왔고, "
        f"그 결과 팀이 신뢰를 쌓고 방향을 조정할 수 있었습니다. 이러한 태도는 {values_line}이라는 제 가치관과 맞닿아 있습니다."
    )

    body_para3 = (
        f"새로운 도구나 방법을 접할 때에도 단순 사용법에 그치지 않고, 왜 효과적인지, 어떤 한계가 있는지 비판적으로 바라보려 노력해 왔습니다. "
        f"귀사의 문화와 방향성에 맞춰 기여하며, 장기적으로 함께 성장하고 싶습니다. "
        f"{comps} 역량을 단순한 스킬이 아니라, 팀과 조직에 신뢰와 동기를 더하는 태도로 풀어나가고자 합니다."
    )

    conclusion = (
        f"앞으로 저는 {roles}로서 {values_line}을(를) 바탕으로 팀에 신뢰와 동기를 더하는 구성원이 되겠습니다. "
        f"기회를 주시면 감사하겠습니다."
    )

    return "\n\n".join([intro, body_para1, body_para2, body_para3, conclusion])


def _build_draft_ko(input_data: SelfIntroInput) -> str:
    """한국어 초안: focus에 따라 strength / experience / values 중 하나의 템플릿 호출."""
    focus = getattr(input_data, "focus", "strength") or "strength"
    if focus == "experience":
        return _build_draft_ko_experience(input_data)
    if focus == "values":
        return _build_draft_ko_values(input_data)
    return _build_draft_ko_strength(input_data)


def _build_draft_en(input_data: SelfIntroInput) -> str:
    """영어 초안: 역량 중심 구조로 본문 생성 (현재 focus 분기 없음, 한 종류만)."""
    bg = input_data.background
    roles = _join_list(input_data.roles, ", ")
    comps = _join_list(input_data.competencies, ", ")

    name = bg.name or "the candidate"
    education = bg.education or "relevant academic training"
    experience_example = (
        bg.experiences[0]
        if bg.experiences
        else "a series of team projects and practical assignments at university"
    )
    strengths = _join_list(bg.strengths, ", ") or "logical thinking and diligence"

    intro = (
        f"My name is {name}. Based on my background in {education}, I am eager to pursue a career as a {roles}. "
        f"Throughout my experiences, I have focused on developing strong competencies in {comps}, "
        f"and I believe these strengths will enable me to contribute to solving complex problems in your organization through data and structured thinking."
    )

    body_para1 = (
        f"First, I had an opportunity to fully leverage these competencies through {experience_example}. "
        f"Instead of simply completing the tasks assigned to me, I tried to break down the situation, identify the core problem, and define clear objectives. "
        f"To achieve this, I actively communicated with team members, gathered diverse perspectives, and aligned our expectations. "
        f"During this process, my strengths in {strengths} naturally emerged, helping the team to make more rational and well-informed decisions. "
        f"This experience taught me how to think and act logically based on data rather than relying on assumptions or intuition."
    )

    body_para2 = (
        f"Second, I view failures and limitations as opportunities for growth. "
        f"While working on projects, I encountered situations where initial hypotheses did not match the actual data, or where communication gaps within the team caused delays. "
        f"In such moments, I took the initiative to openly share issues, analyze the root causes together, and propose realistic alternatives. "
        f"As a result, our team was able to recalibrate our plans, refine our strategies, and ultimately deliver more valuable outcomes. "
        f"Through these experiences, I realized that competencies such as {comps} are not just technical skills but also attitudes that build trust and enable collective growth within an organization."
    )

    body_para3 = (
        f"Third, I have built my own learning system to develop the responsibility and expertise required for the role of {roles}. "
        f"Beyond formal coursework, I have continuously studied through online lectures, books, and real-world datasets, "
        f"striving to narrow the gap between theory and practice. "
        f"Whenever I encountered new tools or methodologies, I tried not only to learn how to use them but also to understand why they are effective and under what conditions they might be limited. "
        f"This approach has strengthened my self-directed learning ability and given me confidence to adapt to rapidly changing environments based on fundamental principles."
    )

    conclusion = (
        f"Looking ahead, I aspire to grow as a {roles} who drives organizational growth through the competencies of {comps}. "
        f"After joining your company, I hope to go beyond faithfully performing my assigned tasks by generating data-driven insights and solving problems that support better decision making. "
        f"I also aim to collaborate closely with colleagues, maximize our collective strengths, and continuously learn and take on new challenges as I grow together with the organization. "
        f"I am confident that my attitude and experiences will create meaningful value and positive change within your company."
    )

    paragraphs = [intro, body_para1, body_para2, body_para3, conclusion]
    return "\n\n".join(paragraphs)


def generate_self_introduction(input_data: SelfIntroInput) -> SelfIntroOutput:
    """
    추천 직무·역량·배경으로 reasoning 문단 + 자기소개서 초안(draft) 생성.
    language가 "ko"면 한국어, 아니면 영어. focus는 한국어일 때만 strength/experience/values 구분.
    """
    if input_data.language == "ko":
        reasoning = _build_reasoning_ko(input_data)
        draft = _build_draft_ko(input_data)
    else:
        reasoning = _build_reasoning_en(input_data)
        draft = _build_draft_en(input_data)

    return SelfIntroOutput(reasoning=reasoning, draft=draft)


def generate_self_introduction_text(input_data: SelfIntroInput) -> str:
    """
    draft(자기소개서 본문)만 필요할 때 사용. 내부적으로는 reasoning까지 만들지만 반환은 draft만.
    결과 문자열에는 'Reasoning', 'STAR' 같은 포맷 용어는 포함되지 않음.
    """
    result = generate_self_introduction(input_data)
    return result.draft


