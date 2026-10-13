/**
 * 客户开通端口（global-tenancy §9.5.4①B/④ · P1c 支付端口）。
 *
 * 订阅领域切片（domain+application 入 core·④）在「开通/改档」时需建立 tenant↔customer 映射，
 * 但**不得** import 应用侧具体 `PaymentService`。application 只消费本端口，实际通道
 * （Stripe/支付宝/微信·`PaymentService.createCustomer`）由参考应用侧适配提供。
 */

export const CUSTOMER_PROVISIONER = Symbol('CUSTOMER_PROVISIONER');

/** 开通后的供应侧客户引用（仅标量·跨包安全·不透出 Payment SDK 类型）。 */
export interface ProvisionedCustomer {
  readonly id: string;
  readonly providerId: string;
}

export interface CustomerProvisioner {
  /** 建立/获取指定 email 的供应侧客户；无可用通道时适配侧抛 503（NFR-2 未配即降级）。 */
  provisionCustomer(email: string): Promise<ProvisionedCustomer>;
}
