export interface SendVerificationEmailJob {
    userId: number;
    name: string;
    email: string;
    rawVerificationToken: string;
}
