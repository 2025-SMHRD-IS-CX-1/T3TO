# user_id를 UUID로 변경 후 코드 업데이트 가이드

## 마이그레이션 순서

1. **데이터베이스 마이그레이션**
   - `migrate_user_id_to_uuid.sql` 실행
   - `update_rls_for_uuid.sql` 실행

2. **코드 업데이트** (아래 참고)

## 코드 변경 사항

### 1. `src/lib/supabase/server.ts`

**변경 전:**
```typescript
const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)
const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', userIdStr)  // 문자열로 변환
    .single()
```

**변경 후:**
```typescript
// user.id는 이미 UUID 타입이므로 변환 불필요
const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', user.id)  // 직접 사용
    .single()
```

### 2. `src/lib/supabase/middleware.ts`

**변경 전:**
```typescript
const userIdStr = typeof user.id === 'string' ? user.id : String(user.id)
const { data: userInDb, error: dbError } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userIdStr)  // 문자열로 변환
    .single()
```

**변경 후:**
```typescript
// user.id는 이미 UUID 타입이므로 변환 불필요
const { data: userInDb, error: dbError } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', user.id)  // 직접 사용
    .single()
```

### 3. `src/app/(auth)/actions.ts`

**변경 전:**
```typescript
const { error: insertError } = await supabase
    .from('users')
    .insert({
        user_id: user.id,  // 이미 올바름 (auth.users.id는 UUID)
        // ...
    })
```

**변경 후:**
```typescript
// 변경 없음 - 이미 올바르게 사용 중
const { error: insertError } = await supabase
    .from('users')
    .insert({
        user_id: user.id,  // UUID 타입 그대로 사용
        // ...
    })
```

### 4. `src/app/(dashboard)/admin/clients/actions.ts`

**변경 전:**
```typescript
const userIdStr = await getEffectiveUserId(counselorId)
const userIdForPublicUsers = typeof userIdStr === 'string' ? userIdStr : String(userIdStr)
const { data: existingUser } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userIdForPublicUsers)  // 문자열로 변환
    .single()
```

**변경 후:**
```typescript
const userId = await getEffectiveUserId(counselorId)  // 이미 UUID
const { data: existingUser } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userId)  // 직접 사용
    .single()
```

### 5. `getEffectiveUserId` 함수 반환 타입

**변경 전:**
```typescript
export async function getEffectiveUserId(counselorId?: string | null): Promise<string | null> {
    // ...
    return typeof user.id === 'string' ? user.id : String(user.id)  // 문자열 변환
}
```

**변경 후:**
```typescript
export async function getEffectiveUserId(counselorId?: string | null): Promise<string | null> {
    // ...
    return user.id  // UUID를 문자열로 변환 (Supabase 클라이언트가 자동 처리)
    // 또는 명시적으로: return user.id.toString()
}
```

## 주의사항

1. **기존 데이터 확인**: `user_id`가 UUID 형식이 아닌 경우 마이그레이션 실패
2. **타입 안정성**: TypeScript 타입 정의 업데이트 필요할 수 있음
3. **RLS 정책**: `auth.uid()::text = user_id::text` → `auth.uid() = user_id`로 변경됨
4. **외래 키**: 모든 참조 테이블의 `user_id`도 UUID로 변경됨

## 테스트 체크리스트

- [ ] 회원가입 테스트
- [ ] 로그인 테스트
- [ ] 내담자 추가 테스트
- [ ] 관리자 페이지 접근 테스트
- [ ] 상담사 선택 기능 테스트
- [ ] RLS 정책 작동 확인
