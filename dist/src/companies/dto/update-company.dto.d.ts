import { CompanyMode, PlanType } from '@prisma/client';
export declare class UpdateCompanyDto {
    name?: string;
    domain?: string;
    mode?: CompanyMode;
    plan?: PlanType;
}
