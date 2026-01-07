import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address of the account',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;
}
