export declare enum EmailTemplateType {
    REJECTION = "REJECTION",
    INTERVIEW_INVITE = "INTERVIEW_INVITE",
    OFFER = "OFFER",
    FOLLOW_UP = "FOLLOW_UP",
    CUSTOM = "CUSTOM"
}
export declare class CreateEmailTemplateDto {
    name: string;
    subject: string;
    body: string;
    type: EmailTemplateType;
    isDefault?: boolean;
}
