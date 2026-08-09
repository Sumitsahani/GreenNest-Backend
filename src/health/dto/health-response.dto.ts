import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'greennest-api' })
  service!: string;

  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({ example: '2026-08-09T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ enum: ['connected', 'not-connected'] })
  database!: 'connected' | 'not-connected';
}

export class HealthSuccessEnvelopeDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: HealthResponseDto })
  data!: HealthResponseDto;
}

export class ErrorBodyDto {
  @ApiProperty({ example: 'NOT_FOUND' })
  code!: string;

  @ApiProperty({ example: 'The requested component was not found' })
  message!: string;

  @ApiProperty({ nullable: true, example: null })
  field!: string | null;

  @ApiProperty({ nullable: true, example: null })
  details!: unknown;

  @ApiProperty({ example: 'req_f6fd68d0' })
  requestId!: string;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
