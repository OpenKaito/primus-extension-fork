import request from '@/utils/request';
import {
    clearAttestationReportContext,
    enrichAttestationReportRawData,
} from '@/pages/Background/utils/reportEvent';

type EventInfo = {
    eventType: string;
    rawData: any;
};
export const eventReport = async (data: EventInfo) => {
    let storedata: any = {};
    storedata.eventType = data.eventType;
    const { keyStore } = await chrome.storage.local.get(['keyStore']);
    if (keyStore) {
        const { address } = JSON.parse(keyStore);
        storedata.walletAddressOnChainId = "0x" + address;
    }
    if (data.rawData) {
        data.rawData = await enrichAttestationReportRawData(
            data.eventType,
            data.rawData
        );
        storedata.rawData = JSON.stringify(data.rawData);
    }

    try {
        return await request({
          method: 'post',
          url: `/public/event/report`,
          data: storedata,
        });
    } finally {
        if (
            data.eventType === 'ATTESTATION_GENERATE' &&
            ['SUCCESS', 'FAILED'].includes(data.rawData?.status)
        ) {
            await clearAttestationReportContext();
        }
    }
};