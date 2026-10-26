// src/types/index.ts

// ConfigおよびProductionの項目定義
export type ScanItem = {
  name: string;
  type?: string;
  value?: string;
  regex?: string;
};