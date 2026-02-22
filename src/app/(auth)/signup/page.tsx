"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import Link from "next/link"
import { signup } from "../actions"
import { useState } from "react"

const PRIVACY_CONTENT = `
제1조 (개인정보의 수집·이용 목적)
회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 개인정보 보호법 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.

1. 회원 가입 및 관리: 회원 가입 의사 확인, 회원제 서비스 제공에 따른 본인 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지, 각종 고지·통지
2. 재화 또는 서비스 제공: 진로·커리어 상담, 로드맵 관리, 자기소개서 작성 지원 등 서비스 제공, 콘텐츠 제공
3. 마케팅 및 광고에의 활용: 서비스의 유효성 확인, 접속빈도 파악 또는 회원의 서비스 이용에 대한 통계

제2조 (수집하는 개인정보 항목)
회사는 회원가입, 서비스 제공 등을 위해 아래와 같은 개인정보를 수집합니다.

• 필수항목: 이름, 이메일 주소, 비밀번호
• 선택항목: 연령대, 성별, 학력, 전공, 경력 사항, 진로 성향, 보유 기술, 희망 직무, 목표 기업 (서비스 이용 시 입력하는 항목)

제3조 (개인정보의 보유 및 이용 기간)
① 회사는 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.
② 각각의 개인정보 처리 및 보유 기간은 다음과 같습니다.
  - 회원 가입 정보: 회원 탈퇴 시까지 (단, 관계 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관)
  - 전자상거래 등에서의 계약·청약철회 등에 관한 기록: 5년 (전자상거래 등에서의 소비자 보호에 관한 법률)
  - 소비자 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래 등에서의 소비자 보호에 관한 법률)
  - 표시·광고에 관한 기록: 6개월 (전자상거래 등에서의 소비자 보호에 관한 법률)

제4조 (개인정보의 제3자 제공)
회사는 정보주체의 개인정보를 제1조(개인정보의 수집·이용 목적)에서 명시한 범위 내에서만 처리하며, 정보주체의 동의, 법률의 특별한 규정 등 개인정보 보호법 제17조 및 제18조에 해당하는 경우에만 개인정보를 제3자에게 제공합니다.

제5조 (정보주체의 권리·의무 및 행사방법)
① 정보주체는 회사에 대해 언제든지 개인정보 열람·정정·삭제·처리정지 요구 등의 권리를 행사할 수 있습니다.
② 제1항에 따른 권리 행사는 회사에 대해 서면, 전자우편 등을 통하여 하실 수 있으며 회사는 이에 대해 지체 없이 조치하겠습니다.
③ 개인정보 보호법 제35조 제4항, 제37조 제2항에 의하여 정보주체의 권리가 제한될 수 있습니다.

제6조 (동의 거부 권리 및 불이익)
개인정보 수집·이용에 대한 동의는 회원가입 및 서비스 이용을 위해 필수입니다. 동의를 거부하실 권리가 있으나, 동의 거부 시 회원가입 및 서비스 이용이 제한됩니다.

제7조 (개인정보 보호책임자)
회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다. (서비스 운영 시 담당자 연락처 등으로 교체 가능)
`.trim()

const TERMS_CONTENT = `
제1조 (목적)
본 약관은 Career Bridge(이하 "회사")가 제공하는 진로·커리어 상담 및 관련 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.

제2조 (정의)
① "서비스"란 회사가 제공하는 진로·커리어 상담, 로드맵 관리, 자기소개서 작성 지원 등 일체의 서비스를 의미합니다.
② "이용자"란 본 약관에 따라 회사가 제공하는 서비스를 받는 회원 및 비회원을 말합니다.
③ "회원"이란 회사에 개인정보를 제공하여 회원등록을 한 자로서, 회사가 제공하는 서비스를 계속적으로 이용할 수 있는 자를 말합니다.

제3조 (약관의 효력 및 변경)
① 본 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.
② 회사는 필요한 경우 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경된 약관은 제1항과 같은 방법으로 공지함으로써 효력이 발생합니다.
③ 회사가 약관을 변경할 경우에는 적용일자 및 변경사유를 명시하여 현행약관과 함께 서비스 초기화면에 그 적용일자 7일 이전부터 적용일자 전일까지 공지합니다.

제4조 (서비스의 제공 및 변경)
① 회사는 다음과 같은 서비스를 제공합니다.
  - 진로·커리어 상담 서비스
  - 로드맵 작성 및 관리
  - 자기소개서 작성 지원
  - 일정·상담 관리
  - 기타 회사가 정하는 서비스
② 회사는 상당한 이유가 있는 경우 운영상·기술상의 필요에 따라 제공하고 있는 서비스를 변경할 수 있습니다.

제5조 (이용계약의 성립)
① 이용계약은 이용자가 회원가입 시 약관의 내용에 동의하고, 회사가 정한 소정의 절차에 따라 회원가입을 완료함으로써 성립됩니다.
② 이용계약은 관련 법령에 따라 만 14세 미만의 경우 회원가입이 제한될 수 있습니다.

제6조 (회원정보의 변경)
회원은 회원가입 신청 시 기재한 사항이 변경되었을 경우 온라인으로 수정을 하거나 전자우편 기타 방법으로 회사에 그 변경사항을 알려야 합니다.

제7조 (이용자의 의무)
이용자는 다음 행위를 하여서는 안 됩니다.
① 타인의 정보 도용
② 회사가 게시한 정보의 무단 변경
③ 회사 및 기타 제3자의 저작권 등 지적재산권에 대한 침해
④ 회사 및 기타 제3자의 명예를 손상시키거나 업무를 방해하는 행위
⑤ 외설 또는 폭력적인 메시지, 기타 공서양속에 반하는 정보를 서비스에 공개 또는 게시하는 행위

제8조 (저작권의 귀속)
① 회사가 작성한 저작물에 대한 저작권 기타 지적재산권은 회사에 귀속합니다.
② 이용자는 회사를 이용함으로써 얻은 정보를 회사의 사전 승낙 없이 복제, 송신, 출판, 배포, 방송 기타 방법에 의하여 영리목적으로 이용하거나 제3자에게 이용하게 하여서는 안 됩니다.

제9조 (면책조항)
① 회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.
② 회사는 이용자의 귀책사유로 인한 서비스 이용의 장애에 대하여 책임을 지지 않습니다.
③ 회사는 이용자가 서비스를 이용하여 기대하는 수익을 얻지 못하거나 상실한 것에 대하여 책임을 지지 않습니다.

제10조 (서비스의 변경·중단)
회사는 상당한 이유가 있는 경우 운영상·기술상의 필요에 따라 제공하고 있는 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 이에 대하여 관련 법령에 특별한 규정이 없는 한 이용자에게 별도의 보상을 하지 않습니다.

제11조 (이용제한)
회사는 이용자가 본 약관의 의무를 위반하거나 서비스의 정상적인 운영을 방해한 경우, 경고·일시정지·영구이용정지 등으로 서비스 이용을 단계적으로 제한할 수 있습니다.

제12조 (준거법 및 관할)
① 본 약관의 해석 및 회사와 이용자 간의 분쟁에 대하여는 대한민국의 법률을 적용합니다.
② 본 약관과 관련하여 회사와 이용자 간에 발생한 분쟁에 관한 소송은 회사의 본사 소재지를 관할하는 법원을 관할 법원으로 합니다.
`.trim()

export default function SignupPage() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [privacyAgreed, setPrivacyAgreed] = useState(false)
    const [termsAgreed, setTermsAgreed] = useState(false)
    const [openPrivacyDialog, setOpenPrivacyDialog] = useState(false)
    const [openTermsDialog, setOpenTermsDialog] = useState(false)

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)

        // 동의 여부를 FormData에 추가
        formData.set('privacyAgreed', privacyAgreed.toString())
        formData.set('termsAgreed', termsAgreed.toString())

        try {
            const result = await signup(formData)
            
            console.log('Signup result (전체):', result)
            console.log('Signup result.error:', result?.error)
            console.log('Signup result.success:', result?.success)

            if (result?.error) {
                console.error('Signup error (상세):', {
                    error: result.error,
                    fullResult: result
                })
                setError(result.error)
                setLoading(false)
                return
            }

            // 성공 시 로그인 페이지로 리다이렉트
            if (result?.success) {
                console.log('Signup successful, redirecting to login page...')
                setTimeout(() => {
                    window.location.href = '/login?signup=success'
                }, 300)
            } else {
                // 성공하지 않았는데 에러도 없는 경우
                console.warn('Signup returned without success or error:', result)
                setError('회원가입 처리 중 문제가 발생했습니다. 다시 시도해주세요.')
                setLoading(false)
            }
        } catch (err: any) {
            console.error('Signup exception:', err)
            // NEXT_REDIRECT 에러는 무시 (이미 리다이렉트됨)
            if (err?.message?.includes('NEXT_REDIRECT')) {
                return
            }
            setError(err?.message || '회원가입 중 오류가 발생했습니다.')
            setLoading(false)
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <Card className="w-[400px]">
                <CardHeader>
                    <CardTitle>회원가입</CardTitle>
                    <CardDescription>새로운 계정을 생성하고 시작하세요</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={handleSubmit} className="grid w-full items-center gap-4" autoComplete="off">
                        <div className="flex flex-col space-y-1.5">
                            <Input id="name" name="name" placeholder="이름" required autoComplete="off" />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Input id="email" name="email" placeholder="이메일" type="email" required autoComplete="off" />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Input id="password" name="password" type="password" placeholder="비밀번호" required autoComplete="new-password" />
                        </div>

                        {/* 정보보안 동의 */}
                        <div className="flex flex-col space-y-3 mt-2">
                            <div className="flex items-start space-x-2">
                                <Checkbox 
                                    id="privacyAgreed" 
                                    checked={privacyAgreed}
                                    onCheckedChange={(checked) => setPrivacyAgreed(checked === true)}
                                    className="mt-1"
                                />
                                <Label htmlFor="privacyAgreed" className="text-sm leading-relaxed cursor-pointer">
                                    <span className="font-semibold">[필수]</span> 개인정보 수집 및 이용에 동의합니다.
                                    <button
                                        type="button"
                                        className="text-purple-700 hover:underline ml-1"
                                        onClick={(e) => { e.preventDefault(); setOpenPrivacyDialog(true); }}
                                    >
                                        자세히 보기
                                    </button>
                                </Label>
                            </div>
                            <div className="flex items-start space-x-2">
                                <Checkbox 
                                    id="termsAgreed" 
                                    checked={termsAgreed}
                                    onCheckedChange={(checked) => setTermsAgreed(checked === true)}
                                    className="mt-1"
                                />
                                <Label htmlFor="termsAgreed" className="text-sm leading-relaxed cursor-pointer">
                                    <span className="font-semibold">[필수]</span> 이용약관에 동의합니다.
                                    <button
                                        type="button"
                                        className="text-purple-700 hover:underline ml-1"
                                        onClick={(e) => { e.preventDefault(); setOpenTermsDialog(true); }}
                                    >
                                        자세히 보기
                                    </button>
                                </Label>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                                <p className="font-semibold mb-1">회원가입 실패</p>
                                <p>{error}</p>
                            </div>
                        )}

                        <div className="flex flex-col space-y-2 mt-4">
                            <Button 
                                className="w-full" 
                                disabled={loading || !privacyAgreed || !termsAgreed}
                                type="submit"
                            >
                                {loading ? "계정 생성 중..." : "계정 생성"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="flex flex-col space-y-2">
                    <div className="text-sm text-center text-gray-500">
                        이미 계정이 있으신가요? <Link href="/login" className="text-purple-700 hover:underline">로그인</Link>
                    </div>
                </CardFooter>
            </Card>

            {/* 개인정보 수집·이용 동의 내용 */}
            <Dialog open={openPrivacyDialog} onOpenChange={setOpenPrivacyDialog}>
                <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>개인정보 수집 및 이용 동의</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto pr-2 py-2 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                        {PRIVACY_CONTENT}
                    </div>
                </DialogContent>
            </Dialog>

            {/* 이용약관 내용 */}
            <Dialog open={openTermsDialog} onOpenChange={setOpenTermsDialog}>
                <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>이용약관</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto pr-2 py-2 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                        {TERMS_CONTENT}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
