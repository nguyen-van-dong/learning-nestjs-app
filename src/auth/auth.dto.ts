import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RegisterDTO {
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;
}

export class LoginDTO {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  device_name?: string;
}

export class RefreshTokenDTO {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}

export class VerifyAccountDTO {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class EmailDTO {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDTO {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
