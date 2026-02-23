const serviceKey = '8bed8c52002a79459e00349193d2b733817e2459a6902542c6737312962a8f3f';
const urlList = 'https://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList';
const urlSchedule = 'https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList';

const XMLParser = require('fast-xml-parser').XMLParser;
const parser = new XMLParser();

async function test() {
    console.log('--- Step 1: Get Qualification List (Finding jmCd for 정보처리기사) ---');
    // Note: getList is on openapi.q-net.or.kr, schedule is on apis.data.go.kr
    // Let's try to find "정보처리기사"

    // The user said "Get from the list of all qualifications".
    // I need to search for it.

    // Just get the first page to see format.
    const fullUrlList = `${urlList}?serviceKey=${serviceKey}&pageNo=1&numOfRows=10&_type=xml`;
    console.log('List URL:', fullUrlList);

    let jmCd = '';

    try {
        const res = await fetch(fullUrlList);
        console.log('List Status:', res.status);
        const text = await res.text();
        // console.log('List Body:', text.substring(0, 500));

        // I need to parse this to find the Code.
        // Since I can't easily parse in this script without library (actually I can use regex for test),
        // I'll assume the user code 1320 is correct for now or try to prompt the list content.

        // However, previous test on openapi.q-net.or.kr timed out.
        // Let's retry it. If it fails, I might need to ask user for the List endpoint too.
        // But user said "종목코드는 자격증 전체 조회하는 목록에서 조회해서 가져오면됨"

    } catch (e) {
        console.error('List Error:', e);
    }

    console.log('\n--- Step 2: Get Schedule with jmCd=1320 (Information Processing Engineer) ---');
    // Use jmCd=1320 (Common code for Info Process Engineer)
    // Reduce numOfRows to 50
    const params = new URLSearchParams({
        serviceKey: serviceKey,
        numOfRows: '50',
        pageNo: '1',
        dataFormat: 'xml',
        implYy: '2025',
        qualgbCd: 'T',
        jmCd: '1320'
    });

    const fullUrlSchedule = `${urlSchedule}?${params.toString()}`;
    console.log('Schedule URL:', fullUrlSchedule);

    try {
        const res = await fetch(fullUrlSchedule);
        console.log('Schedule Status:', res.status);
        const text = await res.text();
        console.log('Schedule Body:', text.substring(0, 1000));
    } catch (e) {
        console.error('Schedule Error:', e);
    }
}

test();
