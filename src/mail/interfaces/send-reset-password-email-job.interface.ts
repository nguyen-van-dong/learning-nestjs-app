export interface SendResetPasswordEmailJob {
    userId: number;
    name: string;
    email: string;
    rawResetToken: string;
}
