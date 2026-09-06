import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class EmailCredentialsDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Password@123', minLength: 6, format: 'password' })
  @IsString()
  @MinLength(6, { message: 'Password must contain at least 6 characters' })
  password!: string;
}

export class RequestOtpDto {
  @ApiProperty({ example: '9876543210' })
  @Matches(/^\d{10}$/, { message: 'Phone must contain exactly 10 digits' })
  phone!: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain exactly 6 digits' })
  code!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'Sumit Kumar' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ example: 'Bengaluru, India' })
  @IsString()
  @Length(2, 120)
  location!: string;

  @ApiProperty({ enum: ['Beginner', 'Intermediate', 'Experienced'] })
  @IsIn(['Beginner', 'Intermediate', 'Experienced'])
  experience!: 'Beginner' | 'Intermediate' | 'Experienced';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}

export class LogoutDto {
  @ApiProperty({ required: false, example: 'global' })
  @IsString()
  @IsNotEmpty()
  scope = 'global';
}
