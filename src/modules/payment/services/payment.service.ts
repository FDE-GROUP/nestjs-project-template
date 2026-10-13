import { ConfigService } from '@app/config/config.service';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  CreateCheckoutInput,
  NormalizedPaymentEvent,
  PaymentCheckoutRef,
  PaymentCustomerInput,
  PaymentCustomerRef,
  PaymentProvider,
  PaymentProviderId,
  PaymentRefundRef,
  RefundInput,
} from '../providers/payment.interface';

/**
 * 支付门面：依 `payment.provider` 选择已注册的 `PaymentProvider`。
 *
 * 采用**懒解析**——构造期不校验，避免未配任何通道时炸启动（NFR-2 未配即降级）；
 * 仅在实际调用支付操作时，若无可用通道才抛 `ServiceUnavailableException`。
 */
@Injectable()
export class PaymentService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject('PAYMENT_PROVIDERS')
    private readonly providers: Record<string, PaymentProvider>,
  ) {}

  /** 当前可用通道概览（不抛错，供健康检查/诊断用）。 */
  describe(): { selected: PaymentProviderId; available: PaymentProviderId[] } {
    return {
      selected: this.config.getPaymentConfig().provider,
      available: Object.values(this.providers).map((p) => p.id),
    };
  }

  supportsRecurring(): boolean {
    return this.resolve().supportsRecurring();
  }

  createCustomer(input: PaymentCustomerInput): Promise<PaymentCustomerRef> {
    return this.resolve().createCustomer(input);
  }

  createCheckout(input: CreateCheckoutInput): Promise<PaymentCheckoutRef> {
    return this.resolve().createCheckout(input);
  }

  retrieveCheckout(id: string): Promise<PaymentCheckoutRef> {
    return this.resolve().retrieveCheckout(id);
  }

  refund(input: RefundInput): Promise<PaymentRefundRef> {
    return this.resolve().refund(input);
  }

  verifyWebhook(rawBody: string, signature: string): Promise<NormalizedPaymentEvent> {
    return this.resolve().verifyWebhook(rawBody, signature);
  }

  private resolve(): PaymentProvider {
    const wanted = this.config.getPaymentConfig().provider;
    const provider = this.providers[wanted] ?? this.providers.stripe;
    if (!provider) {
      throw new ServiceUnavailableException(
        `No payment provider configured (required: "${wanted}"). Enable stripe/alipay/wechat_pay.`,
      );
    }
    return provider;
  }
}
