export class PasswordResetRequestedEvent {
    constructor(
        public readonly userId: number,
        public readonly name: string,
        public readonly email: string,
        public readonly rawResetToken: string,
        public readonly resetTokenId: number,
    ) { }
}
