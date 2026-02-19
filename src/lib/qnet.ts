import { XMLParser } from 'fast-xml-parser';
import { ExamSchedule } from './roadmap-data';

const SERVICE_KEY = process.env.QNET_SERVICE_KEY;

// URLs
const URL_QUAL_LIST = "http://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList";
const URL_EXAM_SCHEDULE = "http://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList";

const parser = new XMLParser();

async function fetchXml(url: string, params: Record<string, string | number>) {
    const searchParams = new URLSearchParams();
    if (SERVICE_KEY) {
        searchParams.append('serviceKey', SERVICE_KEY); // Service key must be urldecoded if passed this way, but usually it's already encoded. Let's try appending directly string first.
    }

    // Q-Net API often requires the ServiceKey to be passed exactly as is (decoded or encoded depending on their system).
    // The key provided is '8bed8c52002a79459e00349193d2b733817e2459a6902542c6737312962a8f3f', which looks like a decoded hex string or just a random string, not a standard URL-encoded key.
    // However, for data.go.kr, usually it's URL encoded.
    // Let's manually construct the query string to be safe, or just trust URLSearchParams.
    // Given the key format, it seems safe to just append.

    Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value));
    });

    // We must append serviceKey manually because URLSearchParams encodes special characters, 
    // and sometimes these APIs are picky about decoding.
    // But this key has no special chars, so it should be fine.

    const queryString = searchParams.toString();
    const fullUrl = `${url}?${queryString}`;

    try {
        console.log(`Fetching: ${fullUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(fullUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`Fetch failed: ${response.status} ${response.statusText}`);
            return null;
        }
        const text = await response.text();
        const json = parser.parse(text);
        return json;
    } catch (error) {
        if ((error as any).name === 'AbortError') {
            console.error("XML Fetch Timeout:", url);
        } else {
            console.error("XML Fetch Error:", error);
        }
        return null;
    }
}

interface QualificationItem {
    jmcd: string; // code
    jmfldnm: string; // name
}

export async function getQualificationList(): Promise<QualificationItem[]> {
    // This API returns a huge list. We might want to cache this or just fetch it once.
    // For now, let's just fetch it.
    const json = await fetchXml(URL_QUAL_LIST, {});

    if (!json || !json.response || !json.response.body || !json.response.body.items) {
        return [];
    }

    const items = json.response.body.items.item;
    if (Array.isArray(items)) {
        return items;
    } else if (items) {
        return [items];
    }
    return [];
}

export async function getTestSchedule(jmCd: string): Promise<any[]> {
    const nowYear = new Date().getFullYear();
    const params = {
        numOfRows: 100, // Fetch enough rows
        pageNo: 1,
        dataFormat: 'xml',
        implYy: nowYear,
        jmCd: jmCd
    };

    const json = await fetchXml(URL_EXAM_SCHEDULE, params);

    if (!json || !json.response || !json.response.body || !json.response.body.items) {
        return [];
    }

    const items = json.response.body.items.item;
    if (Array.isArray(items)) {
        return items;
    } else if (items) {
        return [items];
    }
    return [];
}

const DATE_MAPPING = [
    { start: 'docRegStartDt', end: 'docRegEndDt', suffix: '필기 원서접수' },
    { start: 'docExamStartDt', end: 'docExamEndDt', suffix: '필기 시험' },
    { start: 'docPassDt', end: 'docPassDt', suffix: '필기 합격자 발표' },
    { start: 'pracRegStartDt', end: 'pracRegEndDt', suffix: '실기 원서접수' },
    { start: 'pracExamStartDt', end: 'pracExamEndDt', suffix: '실기 시험' },
    { start: 'pracPassDt', end: 'pracPassDt', suffix: '최종 합격자 발표' }
];

export async function getIntegratedExamSchedules(targetNames: string[]): Promise<ExamSchedule[]> {
    console.log("Starting integrated exam schedule fetch for:", targetNames);

    // 1. Get all qualifications to map names to codes
    const qualList = await getQualificationList();
    const nameToCode: Record<string, string> = {};
    const codeToName: Record<string, string> = {};

    qualList.forEach(item => {
        if (targetNames.includes(item.jmfldnm)) {
            nameToCode[item.jmfldnm] = item.jmcd;
        }
        codeToName[item.jmcd] = item.jmfldnm; // Map all for reference
    });

    const schedules: ExamSchedule[] = [];
    const seenEvents = new Set<string>();

    // 2. Fetch schedule for each target in parallel
    const promises = targetNames.map(async (name) => {
        const code = nameToCode[name];
        if (!code) {
            console.warn(`Code not found for qualification: ${name}`);
            return [];
        }

        try {
            const scheduleItems = await getTestSchedule(code);
            return scheduleItems.map(item => ({ item, name, code }));
        } catch (e) {
            console.error(`Error fetching schedule for ${name}:`, e);
            return [];
        }
    });

    const results = await Promise.all(promises);

    results.flat().forEach(({ item, name, code }) => {
        const description = item.description || '';
        // Extract round info (e.g., "2026년도 제1회")
        const roundInfoMatch = description.match(/\((.*?)\)/);
        const roundInfo = roundInfoMatch ? roundInfoMatch[1] : '';

        for (const map of DATE_MAPPING) {
            const startDateStr = String(item[map.start] || '');
            const endDateStr = String(item[map.end] || '');

            if (startDateStr && endDateStr && startDateStr !== 'undefined') {
                const startFmt = `${startDateStr.slice(0, 4)}-${startDateStr.slice(4, 6)}-${startDateStr.slice(6)}`;
                const endFmt = `${endDateStr.slice(0, 4)}-${endDateStr.slice(4, 6)}-${endDateStr.slice(6)}`;

                const summary = `[${name}] ${map.suffix} (${roundInfo})`;
                const uniqueKey = `${summary}-${startFmt}`;

                if (!seenEvents.has(uniqueKey)) {
                    seenEvents.add(uniqueKey);
                    schedules.push({
                        summary: summary,
                        start_date: startFmt, // Use startFmt which is YYYY-MM-DD
                        end_date: endFmt,
                        description: `종목: ${name} / 코드: ${code}`
                    });
                }
            }
        }
    });

    // Sort by start date
    return schedules.sort((a, b) => a.start_date.localeCompare(b.start_date));
}
