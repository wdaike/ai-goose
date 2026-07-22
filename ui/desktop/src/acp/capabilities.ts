export interface AcpFeatureCapabilities {
  localInference: boolean;
}

export async function getAcpFeatureCapabilities(): Promise<AcpFeatureCapabilities> {
  return { localInference: false };
}
