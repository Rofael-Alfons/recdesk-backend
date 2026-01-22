export interface CurrentUserData {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    companyId: string;
    company: {
        id: string;
        name: string;
        mode: string;
        plan: string;
    };
}
export declare const CurrentUser: (...dataOrPipes: (keyof CurrentUserData | import("@nestjs/common").PipeTransform<any, any> | import("@nestjs/common").Type<import("@nestjs/common").PipeTransform<any, any>> | undefined)[]) => ParameterDecorator;
