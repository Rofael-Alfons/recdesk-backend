export declare enum CompanyMode {
    FULL_ATS = "FULL_ATS",
    PRE_ATS = "PRE_ATS"
}
export declare class RegisterDto {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    companyName: string;
    companyDomain?: string;
    companyMode?: CompanyMode;
}
