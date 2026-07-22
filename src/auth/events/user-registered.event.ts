export class UserRegisteredEvent {
    constructor(
        public readonly userId: number,
        public readonly name: string,
        public readonly email: string,
        public readonly rawVerificationToken: string,
    ) { }
}
