import { Public } from '@core/tenancy/public.decorator';
import { TenantExempt } from '@core/tenancy/tenant-exempt.decorator';
import type { RawBodyRequest } from '@nestjs/common';
import { Body, Controller, Get, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CreateCheckoutDto } from '../dto/create-checkout.dto';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { RefundPaymentDto } from '../dto/refund-payment.dto';
import { PaymentService } from '../services/payment.service';

@ApiTags('payment')
// S11 复合全局：payment 非 webhook 属用户级（Stripe customer/checkout·不经租户仓储）→ 类级豁免租户墙（仍需会话）；
// webhook 方法级 @Public 自动兼豁免会话+租户墙。
@TenantExempt()
@Controller('payment')
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  @Get('test')
  @ApiOperation({ summary: 'Payment integration status' })
  @ApiResponse({ status: 200, description: 'Current provider selection and available channels' })
  test() {
    return { status: 'ok', ...this.payment.describe() };
  }

  @Post('customers')
  @ApiOperation({ summary: 'Create a payment customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  async createCustomer(@Body() createCustomerDto: CreateCustomerDto) {
    return this.payment.createCustomer(createCustomerDto);
  }

  @Post('checkouts')
  @ApiOperation({ summary: 'Create a checkout (payment intent)' })
  @ApiResponse({ status: 201, description: 'Checkout created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createCheckout(@Body() createCheckoutDto: CreateCheckoutDto) {
    return this.payment.createCheckout(createCheckoutDto);
  }

  @Get('checkouts/:id')
  @ApiOperation({ summary: 'Retrieve a checkout' })
  @ApiParam({ name: 'id', description: 'Checkout (payment intent) ID' })
  @ApiResponse({ status: 200, description: 'Checkout retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Checkout not found' })
  async retrieveCheckout(@Param('id') id: string) {
    return this.payment.retrieveCheckout(id);
  }

  @Post('refunds')
  @ApiOperation({ summary: 'Refund a checkout' })
  @ApiResponse({ status: 201, description: 'Refund created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async refund(@Body() refundPaymentDto: RefundPaymentDto) {
    return this.payment.refund(refundPaymentDto);
  }

  @Post('webhooks')
  // 入站回调靠 Stripe 签名校验而非会话·S11 显式旁路全局会话墙（deny-by-default 下的例外）。
  @Public()
  @ApiOperation({ summary: 'Handle payment webhook events' })
  @ApiHeader({ name: 'stripe-signature', description: 'Payment provider webhook signature' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature' })
  async handleWebhook(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signature: string,
  ) {
    const payload = request.rawBody?.toString() || '';
    const event = await this.payment.verifyWebhook(payload, signature);

    // 归一化事件类型分发点：新增通道只需在此按 event.type 收敛处理
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Handle successful payment
        break;
      case 'payment_intent.payment_failed':
        // Handle failed payment
        break;
    }

    return { received: true };
  }
}
