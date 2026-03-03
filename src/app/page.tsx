'use client'

import Link from "next/link"
import { useState, useEffect, useCallback } from "react"

export default function LandingPage() {
    const [headerVisible, setHeaderVisible] = useState(false)
    const [hovered, setHovered] = useState(false)

    const handleScroll = useCallback(() => {
        setHeaderVisible(window.scrollY > 80)
    }, [])

    useEffect(() => {
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [handleScroll])

    const showHeader = hovered || headerVisible

    return (
        <div className="min-h-screen bg-white font-[var(--font-primary)] text-[var(--foreground)]">
            {/* Header - 마우스 hover 또는 스크롤 시 나타남 */}
            <div
                className="fixed top-0 left-0 right-0 z-50 h-5"
                onMouseEnter={() => setHovered(true)}
            />
            <header
                className={`fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl transition-all duration-300 ${showHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
                    <Link href="/" className="flex items-center gap-2">
                        <img src="/logo.png" alt="Career Bridge" className="h-8 w-auto object-contain" />
                    </Link>
                    <nav className="flex items-center gap-3">
                        <Link
                            href="/login"
                            className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-[var(--neutral-gray-700)] hover:text-white hover:bg-[var(--purple-700)] transition-all"
                        >
                            로그인
                        </Link>
                        <Link
                            href="/signup"
                            className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-[var(--neutral-gray-700)] hover:text-white hover:bg-[var(--purple-700)] transition-all"
                        >
                            회원가입
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
                <div className="mx-auto max-w-4xl text-center">
                    <p className="mb-6 text-[15px] font-medium tracking-wide text-[var(--purple-700)]">
                        AI 기반 커리어 설계 플랫폼
                    </p>
                    <h1 className="text-[40px] font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--foreground)] sm:text-[56px] md:text-[64px]">
                        내담자의 커리어를
                        <br />
                        <span className="bg-gradient-to-r from-[var(--purple-800)] to-[var(--purple-500)] bg-clip-text text-transparent">
                            데이터로 설계
                        </span>
                        하세요
                    </h1>
                    <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-[var(--neutral-gray-600)] sm:text-[19px]">
                        AI 맞춤 로드맵과 상담 관리를 한곳에서,
                        <br className="hidden sm:block" />
                        내담자와 함께 다음 단계로 나아가세요.
                    </p>
                    <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                        <Link
                            href="/signup"
                            className="inline-flex items-center justify-center rounded-full bg-[var(--purple-700)] px-8 py-4 text-[17px] font-semibold text-white shadow-xl shadow-purple-700/20 hover:bg-[var(--purple-800)] transition-all"
                        >
                            시작하기
                        </Link>
                    </div>
                </div>

                <div className="absolute bottom-8 flex flex-col items-center gap-2 text-[var(--neutral-gray-400)]">
                    <span className="text-xs">스크롤하여 더 알아보기</span>
                    <svg className="h-4 w-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                </div>
            </section>

            {/* Section 1: AI 로드맵 */}
            <section className="relative overflow-hidden bg-[var(--neutral-gray-100)] px-6 py-24 sm:py-32">
                <div className="mx-auto max-w-7xl">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                        <div>
                            <span className="inline-block rounded-full bg-[var(--purple-100)] px-4 py-1.5 text-sm font-semibold text-[var(--purple-700)]">
                                AI 로드맵
                            </span>
                            <h2 className="mt-5 text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--foreground)] sm:text-[40px]">
                                목표 직무에 맞는
                                <br />
                                로드맵을 자동 생성
                            </h2>
                            <p className="mt-4 text-[17px] leading-relaxed text-[var(--neutral-gray-600)]">
                                내담자의 전공, 경력, 희망 직무를 분석하여 단기·중기·장기
                                맞춤 로드맵을 AI가 설계합니다. 웹 검색 기반으로
                                실제 채용 트렌드를 반영합니다.
                            </p>
                            <ul className="mt-6 space-y-3">
                                {["전공·경력 기반 맞춤 설계", "단기·중기·장기 목표 자동 생성", "실시간 채용 트렌드 반영"].map((t) => (
                                    <li key={t} className="flex items-center gap-3 text-[15px] text-[var(--neutral-gray-700)]">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--purple-700)] text-white">
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <div className="overflow-hidden rounded-2xl border border-[var(--neutral-gray-300)] bg-white shadow-2xl shadow-gray-900/5">
                                <img src="/landing-roadmap.png" alt="AI 로드맵 화면" className="w-full object-cover" />
                            </div>
                            <p className="mt-2 text-center text-xs text-[var(--neutral-gray-400)]">* 화면에 표시된 이름·정보는 예시이며, 실제 내담자 정보가 아닙니다.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 2: 상담 관리 */}
            <section className="relative overflow-hidden bg-white px-6 py-24 sm:py-32">
                <div className="mx-auto max-w-7xl">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                        <div className="order-2 lg:order-1">
                            <div className="overflow-hidden rounded-2xl border border-[var(--neutral-gray-300)] bg-white shadow-2xl shadow-gray-900/5">
                                <img src="/landing-consultations.png" alt="상담 관리 화면" className="w-full object-cover" />
                            </div>
                            <p className="mt-2 text-center text-xs text-[var(--neutral-gray-400)]">* 화면에 표시된 이름·정보는 예시이며, 실제 내담자 정보가 아닙니다.</p>
                        </div>
                        <div className="order-1 lg:order-2">
                            <span className="inline-block rounded-full bg-[var(--purple-100)] px-4 py-1.5 text-sm font-semibold text-[var(--purple-700)]">
                                상담 관리
                            </span>
                            <h2 className="mt-5 text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--foreground)] sm:text-[40px]">
                                상담 기록부터
                                <br />
                                AI 분석까지 한번에
                            </h2>
                            <p className="mt-4 text-[17px] leading-relaxed text-[var(--neutral-gray-600)]">
                                내담자별 상담 내용을 기록하고, AI가 강점·가치관·역량을
                                자동 분석합니다. 분석 결과는 로드맵과 자기소개서에
                                바로 연동됩니다.
                            </p>
                            <ul className="mt-6 space-y-3">
                                {["상담 내용 자동 AI 분석", "강점·가치관 자동 추출", "로드맵·자소서 자동 연동"].map((t) => (
                                    <li key={t} className="flex items-center gap-3 text-[15px] text-[var(--neutral-gray-700)]">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--purple-700)] text-white">
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 3: 자소서·커버레터 */}
            <section className="relative overflow-hidden bg-[var(--neutral-gray-100)] px-6 py-24 sm:py-32">
                <div className="mx-auto max-w-7xl">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                        <div>
                            <span className="inline-block rounded-full bg-[var(--purple-100)] px-4 py-1.5 text-sm font-semibold text-[var(--purple-700)]">
                                자소서·커버레터
                            </span>
                            <h2 className="mt-5 text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--foreground)] sm:text-[40px]">
                                합격자 스타일의
                                <br />
                                자기소개서 3종 자동 생성
                            </h2>
                            <p className="mt-4 text-[17px] leading-relaxed text-[var(--neutral-gray-600)]">
                                상담 내용과 프로필을 바탕으로 역량·경험·가치관 중심의
                                자기소개서 3종을 AI가 작성합니다.
                                실제 합격자 데이터를 참고한 스타일로 생성됩니다.
                            </p>
                            <ul className="mt-6 space-y-3">
                                {["역량·경험·가치관 3종 초안", "합격자 데이터 기반 스타일", "AI 다듬기로 품질 향상"].map((t) => (
                                    <li key={t} className="flex items-center gap-3 text-[15px] text-[var(--neutral-gray-700)]">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--purple-700)] text-white">
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <div className="overflow-hidden rounded-2xl border border-[var(--neutral-gray-300)] bg-white shadow-2xl shadow-gray-900/5">
                                <img src="/landing-coverletter.png" alt="자소서 작성 화면" className="w-full object-cover" />
                            </div>
                            <p className="mt-2 text-center text-xs text-[var(--neutral-gray-400)]">* 화면에 표시된 이름·정보는 예시이며, 실제 내담자 정보가 아닙니다.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 4: 역량·자격증 */}
            <section className="relative overflow-hidden bg-white px-6 py-24 sm:py-32">
                <div className="mx-auto max-w-7xl">
                    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                        <div className="order-2 lg:order-1">
                            <div className="overflow-hidden rounded-2xl border border-[var(--neutral-gray-300)] bg-white shadow-2xl shadow-gray-900/5">
                                <img src="/landing-competencies.png" alt="역량 분석 화면" className="w-full object-cover" />
                            </div>
                            <p className="mt-2 text-center text-xs text-[var(--neutral-gray-400)]">* 화면에 표시된 이름·정보는 예시이며, 실제 내담자 정보가 아닙니다.</p>
                        </div>
                        <div className="order-1 lg:order-2">
                            <span className="inline-block rounded-full bg-[var(--purple-100)] px-4 py-1.5 text-sm font-semibold text-[var(--purple-700)]">
                                역량·자격증
                            </span>
                            <h2 className="mt-5 text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--foreground)] sm:text-[40px]">
                                프로필 기반
                                <br />
                                역량 분석과 자격증 추천
                            </h2>
                            <p className="mt-4 text-[17px] leading-relaxed text-[var(--neutral-gray-600)]">
                                학력·경력·전공 데이터를 분석하여 현재 역량 수준을
                                시각화하고, 목표 직무에 필요한 자격증을 추천합니다.
                            </p>
                            <ul className="mt-6 space-y-3">
                                {["직무별 역량 수준 시각화", "Q-Net 연동 자격증 추천", "전공-직무 연관성 분석"].map((t) => (
                                    <li key={t} className="flex items-center gap-3 text-[15px] text-[var(--neutral-gray-700)]">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--purple-700)] text-white">
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Why Career Bridge */}
            <section className="bg-[var(--neutral-gray-900)] px-6 py-24 sm:py-32">
                <div className="mx-auto max-w-7xl">
                    <div className="text-center">
                        <h2 className="text-[32px] font-extrabold tracking-[-0.02em] text-white sm:text-[40px]">
                            Career Bridge를 믿을 수 있는 이유
                        </h2>
                        <p className="mt-3 text-[17px] text-[var(--neutral-gray-400)]">
                            데이터와 AI로 검증된 커리어 설계
                        </p>
                    </div>
                    <div className="mt-16 grid gap-6 sm:grid-cols-3">
                        {[
                            {
                                title: "출처가 있는 AI",
                                desc: "웹 검색 기반으로 실제 채용 정보와 기업 데이터를 반영합니다.",
                                icon: (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                ),
                            },
                            {
                                title: "올인원 대시보드",
                                desc: "내담자 등록부터 상담, 로드맵, 자소서까지 하나의 화면에서 관리합니다.",
                                icon: (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                ),
                            },
                            {
                                title: "데이터 기반 분석",
                                desc: "학력·경력·전공을 반영한 역량 수준 측정과 자격증을 추천합니다.",
                                icon: (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                ),
                            },
                        ].map((item) => (
                            <div key={item.title} className="rounded-2xl border border-[var(--neutral-gray-700)] bg-[var(--neutral-gray-800)] p-8">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--purple-700)]/20">
                                    <svg className="h-6 w-6 text-[var(--purple-400)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        {item.icon}
                                    </svg>
                                </div>
                                <h3 className="mt-5 text-lg font-bold text-white">{item.title}</h3>
                                <p className="mt-2 text-[15px] leading-relaxed text-[var(--neutral-gray-400)] break-keep">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="relative overflow-hidden bg-white px-6 py-24 sm:py-32">
                <div className="mx-auto max-w-3xl text-center">
                    <h2 className="text-[32px] font-extrabold tracking-[-0.02em] text-[var(--foreground)] sm:text-[44px]">
                        지금 바로 시작하세요
                    </h2>
                    <p className="mt-4 text-[17px] leading-relaxed text-[var(--neutral-gray-600)]">
                        내담자의 커리어를 데이터와 AI로 설계하는 새로운 경험.
                        <br />
                        Career Bridge가 함께합니다.
                    </p>
                    <div className="mt-10">
                        <Link
                            href="/signup"
                            className="inline-flex items-center justify-center rounded-full bg-[var(--purple-700)] px-10 py-4 text-[17px] font-bold text-white shadow-xl shadow-purple-700/20 hover:bg-[var(--purple-800)] transition-all"
                        >
                            시작하기
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-[var(--neutral-gray-200)] bg-white px-6 py-10">
                <div className="mx-auto max-w-7xl flex items-center justify-center">
                    <img src="/logo.png" alt="Career Bridge" className="h-6 w-auto object-contain opacity-60" />
                </div>
            </footer>
        </div>
    )
}
