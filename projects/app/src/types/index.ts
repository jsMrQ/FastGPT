import type { TrackEventName } from '@/web/common/system/constants';

declare global {
  var qaQueueLen: number;
  var autoIndexQueueLen: number;
  var imageIndexQueueLen: number;
  var vectorQueueLen: number;
  var datasetParseQueueLen: number;

  interface Window {
    QRCode: any;
    umami?: {
      track: (event: TrackEventName, data: any) => void;
    };
  }
}
