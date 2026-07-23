import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

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
