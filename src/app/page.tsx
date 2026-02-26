import Link from "next/link"

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-[var(--background)] font-[var(--font-primary)] text-[var(--foreground)]">
            {/* Nav */}
            <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
                    <Link href="/" className="flex items-center">
                        <img src="/logo.png" alt="Career Bridge" className="h-8 w-auto object-contain" />
                    </Link>
                    <nav className="flex items-center gap-4">
                        <Link
                            href="/login"
                            className="text-sm font-medium text-[var(--neutral-gray-700)] hover:text-[var(--foreground)]"
                        >
                            로그인
                        </Link>
                        <Link
                            href="/signup"
                            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
                        >
                            시작하기
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Hero - Liner 스타일 메인 메시지 */}
            <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
                <div className="mx-auto max-w-4xl text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-[var(--foreground)] sm:text-5xl md:text-6xl">
                        당신의 커리어를
                        <br />
                        <span className="text-[var(--purple-700)]">정확하게 설계하세요</span>
                    </h1>
                    <p className="mt-6 text-lg text-[var(--neutral-gray-600)] sm:text-xl">
                        AI 기반 맞춤 로드맵과 상담 관리로, 다음 단계로 나아가세요.
                    </p>
                    <div className="mt-10">
                        <Link
                            href="/login"
                            className="inline-block rounded-xl bg-[var(--primary)] px-8 py-4 text-base font-semibold text-white shadow-lg hover:opacity-90"
                        >
                            시작하기
                        </Link>
                    </div>
                </div>
            </section>

            {/* 믿을 수 있는 이유 - Liner "CITED ANSWERS" 스타일 */}
            <section className="border-t border-[var(--border)] bg-[var(--muted)]/50 px-4 py-16 sm:px-6 sm:py-20">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-center text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
                        Career Bridge를 믿을 수 있는 이유
                    </h2>
                    <p className="mt-2 text-center text-[var(--neutral-gray-600)]">
                        데이터와 AI로 검증된 커리어 설계
                    </p>
                    <div className="mt-12 grid gap-8 sm:grid-cols-3">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--purple-100)] text-[var(--purple-700)]">
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                            </div>
                            <h3 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
                                출처가 있는 AI 로드맵
                            </h3>
                            <p className="mt-2 text-sm text-[var(--neutral-gray-600)]">
                                목표 직무·기업 정보를 검색 기반으로 반영해, 근거 있는 맞춤 로드맵을 제안합니다.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--purple-100)] text-[var(--purple-700)]">
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <h3 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
                                상담·내담자 한곳에서
                            </h3>
                            <p className="mt-2 text-sm text-[var(--neutral-gray-600)]">
                                내담자 등록, 상담 기록, 로드맵 관리까지 하나의 대시보드에서 진행할 수 있습니다.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--purple-100)] text-[var(--purple-700)]">
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <h3 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
                                데이터 기반 역량 분석
                            </h3>
                            <p className="mt-2 text-sm text-[var(--neutral-gray-600)]">
                                학력·경력·전공을 반영한 역량 수준과 자격증 추천으로 설계의 정확도를 높입니다.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 실제 사용 화면 - 필요한 것만 한곳에서와 동일 4칸 구성 */}
            <section className="border-t border-[var(--border)] bg-[var(--neutral-gray-100)] px-4 py-16 sm:px-6 sm:py-20">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-center text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
                        실제 사용 화면
                    </h2>
                    <p className="mt-2 text-center text-[var(--neutral-gray-600)]">
                        화면에 표시된 내담자·로드맵 등은 예시이며, 실제 내담자 정보가 아닙니다.
                    </p>
                    <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
                        {[
                            { title: "AI 로드맵", src: "/landing-roadmap.png", alt: "커리어 로드맵 - 단기·중기·장기 목표와 타임라인" },
                            { title: "상담 관리", src: "/landing-consultations.png", alt: "상담 관리 - 내담자별 상담 기록 및 AI 분석" },
                            { title: "자소서·커버레터", src: "/landing-coverletter.png", alt: "초안 목록 - 맞춤형 자소서 작성" },
                            { title: "역량·자격증", src: "/landing-competencies.png", alt: "핵심 직무 역량 및 추천 자격증" },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm"
                            >
                                <div className="flex h-52 shrink-0 items-center justify-center overflow-hidden bg-[var(--neutral-gray-100)] sm:h-64">
                                    <img
                                        src={item.src}
                                        alt={item.alt}
                                        className="max-h-full max-w-full object-contain"
                                    />
                                </div>
                                <h3 className="shrink-0 border-t border-[var(--border)] px-4 py-3 text-center font-semibold text-[var(--foreground)]">
                                    {item.title}
                                </h3>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 기능 소개 */}
            <section className="px-4 py-16 sm:px-6 sm:py-20">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-center text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
                        필요한 것만 한곳에서
                    </h2>
                    <p className="mt-2 text-center text-[var(--neutral-gray-600)]">
                        로드맵, 상담, 자소서까지 커리어 설계에 필요한 기능을 제공합니다.
                    </p>
                    <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { title: "AI 로드맵", desc: "목표 직무·기업 기반 맞춤 마일스톤", icon: "🗺️" },
                            { title: "상담 관리", desc: "내담자별 상담 기록·일정 관리", icon: "📋" },
                            { title: "자소서·커버레터", desc: "맞춤형 자소서 작성 지원", icon: "✉️" },
                            { title: "역량·자격증", desc: "프로필 기반 역량 분석·자격증 추천", icon: "📊" },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-sm"
                            >
                                <span className="text-2xl">{item.icon}</span>
                                <h3 className="mt-3 font-semibold text-[var(--foreground)]">{item.title}</h3>
                                <p className="mt-1 text-sm text-[var(--neutral-gray-600)]">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-[var(--border)] px-4 py-8 sm:px-6">
                <div className="mx-auto max-w-6xl">
                    <span className="font-medium text-[var(--neutral-gray-700)]">Career Bridge</span>
                </div>
            </footer>
        </div>
    )
}
