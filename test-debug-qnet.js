const serviceKey = '8bed8c52002a79459e00349193d2b733817e2459a6902542c6737312962a8f3f';
const XMLParser = require('fast-xml-parser').XMLParser;
const parser = new XMLParser({ ignoreAttributes: false });

async function fetchXml(url, params) {
    const searchParams = new URLSearchParams({ ...params, serviceKey: serviceKey });
    const fullUrl = `${url}?${searchParams.toString()}`;
    const start = Date.now();
    try {
        const res = await fetch(fullUrl);
        const text = await res.text();
        console.log(`[Fetch] ${url} took ${Date.now() - start}ms`);
        return text;
    } catch (e) {
        console.error(`[Fetch Error] ${e.message}`);
        return null;
    }
}

function parseXml(xmlText) {
    return parser.parse(xmlText);
}

function extractItems(obj) {
    if (!obj || typeof obj !== 'object') return [];
    // Handle different XML structures if needed, but keeping it simple as per qnet-api.ts logic
    const body = obj.response?.body;
    const items = body?.items?.item;
    if (Array.isArray(items)) return items;
    if (items) return [items];
    return [];
}

async function getQualificationList() {
    console.log('[Step 1] Fetching Qualification List...');
    const url = 'https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList';
    const xml = await fetchXml(url, { pageNo: '1', numOfRows: '1000', _type: 'xml' });
    if (!xml) return [];
    const parsed = parseXml(xml);
    const items = extractItems(parsed);
    console.log(`[Step 1] Got ${items.length} qualifications.`);
    return items;
}

async function getExamSchedule(targetNames) {
    const startTotal = Date.now();

    // 1. Get List
    const qualList = await getQualificationList();

    // 2. Map targets
    const combinedTargets = Array.from(new Set(targetNames));
    const targetJmCds = [];

    for (const item of qualList) {
        const name = String(item.jmNm || item.qualNm || '').trim();
        const code = String(item.jmCd || item.qualGbCd || '').trim();

        if (combinedTargets.some(target => name.includes(target) || target.includes(name))) {
            if (!targetJmCds.some(t => t.code === code)) {
                targetJmCds.push({ name, code });
            }
        }
    }
    console.log(`[Step 2] Mapped ${targetJmCds.length} codes for ${targetNames.length} targets.`);
    console.log('Mapped:', targetJmCds);

    // 3. Fetch Schedules
    const url = 'https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList';
    const currentYear = new Date().getFullYear().toString();

    const promises = targetJmCds.map(async ({ name, code }) => {
        const xml = await fetchXml(url, {
            implYy: currentYear,
            jmCd: code,
            numOfRows: '100',
            pageNo: '1',
            dataFormat: 'xml'
        });
        if (!xml) return [];
        const parsed = parseXml(xml);
        // Debug output for first item
        // console.log('Parsed Schedule:', JSON.stringify(parsed).slice(0, 200));
        return extractItems(parsed).map(item => ({ ...item, qualName: name }));
    });

    const results = await Promise.all(promises);
    const schedules = results.flat();

    console.log(`[Step 3] Fetched ${schedules.length} schedule items.`);
    console.log(`[Total Time] ${Date.now() - startTotal}ms`);
    return schedules;
}

// Simulate the call with some common targets
getExamSchedule(['정보처리기사', 'SQLD', '산업안전기사']);
