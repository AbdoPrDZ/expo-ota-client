export { OtaClient } from './OtaClient';
export type { OtaClientApi } from './OtaClient';
export { OTAProvider } from './components/OTAProvider';
export type { OTAProviderProps } from './components/OTAProvider';
export { OTAUpdateOverlay } from './components/OTAUpdateOverlay';
export type { OTAUpdateOverlayCopy, OTAUpdateOverlayProps } from './components/OTAUpdateOverlay';
export { OTADemoAccessScreen } from './components/OTADemoAccessScreen';
export type { OTADemoAccessCopy, OTADemoAccessScreenProps } from './components/OTADemoAccessScreen';
export { useOTA } from './context';
export type { OtaContextValue } from './context';
export { OtaDisabledError, OtaRequestError } from './errors';
export { errorCode, OTA_APK_ERRORS } from './installer';
export { otaColors, otaRadius, otaSpacing } from './styles';
export type * from './types';

export { OtaClient as default } from './OtaClient';
