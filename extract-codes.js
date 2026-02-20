const serviceKey = '8bed8c52002a79459e00349193d2b733817e2459a6902542c6737312962a8f3f';
const XMLParser = require('fast-xml-parser').XMLParser;
const parser = new XMLParser({ ignoreAttributes: false });

async function fetchXml(url, params) {
    const searchParams = new URLSearchParams({ ...params, serviceKey: serviceKey });
    const fullUrl = `${url}?${searchParams.toString()}`;
    try {
        const res = await fetch(fullUrl);
        const text = await res.text();
        return text;
    } catch (e) {
        return null;
    }
}

function parseXml(xmlText) {
    return parser.parse(xmlText);
}

function extractItems(obj) {
    if (!obj || typeof obj !== 'object') return [];
    const body = obj.response?.body;
    const items = body?.items?.item;
    if (Array.isArray(items)) return items;
    if (items) return [items];
    return [];
}

async function getCodes() {
    const url = 'https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList';
    // Fetch 500 items to cover most common ones
    const xml = await fetchXml(url, { pageNo: '1', numOfRows: '500', _type: 'xml' });
    if (!xml) return;
    const items = extractItems(parseXml(xml));

    const targets = [
        '정보처리기사', '정보처리산업기사', '빅데이터분석기사', 'ADsP', 'SQLD',
        '건설안전기사', '산업안전기사', '건설기사', '토목기사',
        '전기기사', '전기공사기사', '일반기계기사', '공조냉동기계기사',
        '화공기사', '수질환경기사', '대기환경기사', '폐기물처리기사',
        '컴퓨터활용능력'
    ];

    const map = {};
    items.forEach(item => {
        const name = String(item.jmNm || item.qualNm || '').trim();
        const code = String(item.jmCd || item.qualGbCd || '').trim();
        if (targets.some(t => name.includes(t))) {
            map[name] = code;
        }
    });

    console.log(JSON.stringify(map, null, 2));
}

getCodes();
