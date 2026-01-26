"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting seed...');
    await prisma.emailSent.deleteMany();
    await prisma.candidateAction.deleteMany();
    await prisma.candidateNote.deleteMany();
    await prisma.candidateStage.deleteMany();
    await prisma.candidateScore.deleteMany();
    await prisma.candidate.deleteMany();
    await prisma.emailImport.deleteMany();
    await prisma.emailConnection.deleteMany();
    await prisma.pipelineStage.deleteMany();
    await prisma.job.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.emailTemplate.deleteMany();
    await prisma.company.deleteMany();
    console.log('🗑️  Cleared existing data');
    const techCorp = await prisma.company.create({
        data: {
            name: 'TechCorp Egypt',
            domain: 'techcorp.com.eg',
            mode: client_1.CompanyMode.FULL_ATS,
            plan: client_1.PlanType.PROFESSIONAL,
        },
    });
    const startupXYZ = await prisma.company.create({
        data: {
            name: 'StartupXYZ',
            domain: 'startupxyz.io',
            mode: client_1.CompanyMode.PRE_ATS,
            plan: client_1.PlanType.PRE_ATS_SCREENING,
        },
    });
    console.log('🏢 Created companies');
    const passwordHash = await bcrypt.hash('password123', 10);
    const adminUser = await prisma.user.create({
        data: {
            email: 'admin@techcorp.com.eg',
            passwordHash,
            firstName: 'Ahmed',
            lastName: 'Hassan',
            role: client_1.UserRole.ADMIN,
            companyId: techCorp.id,
        },
    });
    const recruiterUser = await prisma.user.create({
        data: {
            email: 'recruiter@techcorp.com.eg',
            passwordHash,
            firstName: 'Sara',
            lastName: 'Mohamed',
            role: client_1.UserRole.RECRUITER,
            companyId: techCorp.id,
        },
    });
    const viewerUser = await prisma.user.create({
        data: {
            email: 'viewer@techcorp.com.eg',
            passwordHash,
            firstName: 'Mohamed',
            lastName: 'Ali',
            role: client_1.UserRole.VIEWER,
            companyId: techCorp.id,
        },
    });
    const startupAdmin = await prisma.user.create({
        data: {
            email: 'hr@startupxyz.io',
            passwordHash,
            firstName: 'Nour',
            lastName: 'Ibrahim',
            role: client_1.UserRole.ADMIN,
            companyId: startupXYZ.id,
        },
    });
    console.log('👥 Created users');
    const seniorDevJob = await prisma.job.create({
        data: {
            title: 'Senior Backend Developer',
            description: 'We are looking for an experienced backend developer to join our team. You will be working on our core platform using Node.js and PostgreSQL.',
            status: client_1.JobStatus.ACTIVE,
            companyId: techCorp.id,
            experienceLevel: client_1.ExperienceLevel.SENIOR,
            requiredSkills: ['Node.js', 'TypeScript', 'PostgreSQL', 'REST APIs'],
            preferredSkills: ['NestJS', 'Docker', 'AWS', 'GraphQL'],
            requirements: {
                yearsOfExperience: 5,
                education: 'Bachelor in Computer Science or related field',
                languages: ['English', 'Arabic'],
            },
        },
    });
    const juniorDevJob = await prisma.job.create({
        data: {
            title: 'Junior Frontend Developer',
            description: 'Entry-level position for recent graduates passionate about building user interfaces.',
            status: client_1.JobStatus.ACTIVE,
            companyId: techCorp.id,
            experienceLevel: client_1.ExperienceLevel.JUNIOR,
            requiredSkills: ['React', 'JavaScript', 'HTML', 'CSS'],
            preferredSkills: ['TypeScript', 'Next.js', 'TailwindCSS'],
            requirements: {
                yearsOfExperience: 0,
                education: 'Bachelor in Computer Science or related field',
                languages: ['English'],
            },
        },
    });
    const marketingJob = await prisma.job.create({
        data: {
            title: 'Digital Marketing Specialist',
            description: 'Looking for a creative marketing professional to drive our digital presence.',
            status: client_1.JobStatus.ACTIVE,
            companyId: startupXYZ.id,
            experienceLevel: client_1.ExperienceLevel.MID,
            requiredSkills: ['Digital Marketing', 'SEO', 'Google Analytics', 'Social Media'],
            preferredSkills: ['Content Writing', 'PPC', 'Email Marketing'],
            requirements: {
                yearsOfExperience: 2,
                education: 'Bachelor in Marketing or related field',
                languages: ['English', 'Arabic'],
            },
        },
    });
    console.log('💼 Created jobs');
    const seniorDevStages = await Promise.all([
        prisma.pipelineStage.create({
            data: { name: 'New', orderIndex: 0, color: '#6B7280', isDefault: true, jobId: seniorDevJob.id },
        }),
        prisma.pipelineStage.create({
            data: { name: 'Screening', orderIndex: 1, color: '#3B82F6', jobId: seniorDevJob.id },
        }),
        prisma.pipelineStage.create({
            data: { name: 'Technical Interview', orderIndex: 2, color: '#8B5CF6', jobId: seniorDevJob.id },
        }),
        prisma.pipelineStage.create({
            data: { name: 'HR Interview', orderIndex: 3, color: '#EC4899', jobId: seniorDevJob.id },
        }),
        prisma.pipelineStage.create({
            data: { name: 'Offer', orderIndex: 4, color: '#10B981', jobId: seniorDevJob.id },
        }),
    ]);
    const juniorDevStages = await Promise.all([
        prisma.pipelineStage.create({
            data: { name: 'New', orderIndex: 0, color: '#6B7280', isDefault: true, jobId: juniorDevJob.id },
        }),
        prisma.pipelineStage.create({
            data: { name: 'Screening', orderIndex: 1, color: '#3B82F6', jobId: juniorDevJob.id },
        }),
        prisma.pipelineStage.create({
            data: { name: 'Technical Assessment', orderIndex: 2, color: '#8B5CF6', jobId: juniorDevJob.id },
        }),
        prisma.pipelineStage.create({
            data: { name: 'Final Interview', orderIndex: 3, color: '#EC4899', jobId: juniorDevJob.id },
        }),
        prisma.pipelineStage.create({
            data: { name: 'Offer', orderIndex: 4, color: '#10B981', jobId: juniorDevJob.id },
        }),
    ]);
    console.log('📊 Created pipeline stages');
    const candidates = await Promise.all([
        prisma.candidate.create({
            data: {
                fullName: 'Omar Khaled',
                email: 'omar.khaled@gmail.com',
                phone: '+201012345678',
                location: 'Cairo, Egypt',
                linkedinUrl: 'https://linkedin.com/in/omarkhaled',
                githubUrl: 'https://github.com/omarkhaled',
                source: client_1.CandidateSource.EMAIL,
                status: client_1.CandidateStatus.SCREENING,
                cvFileUrl: 'https://s3.amazonaws.com/recdesk/cvs/omar-khaled-cv.pdf',
                cvFileName: 'omar-khaled-cv.pdf',
                cvText: 'Senior Software Engineer with 6 years of experience in Node.js, TypeScript, and PostgreSQL...',
                extractionConfidence: 95,
                overallScore: 87,
                aiSummary: 'Strong candidate with extensive backend experience. Excellent match for senior role.',
                skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS', 'NestJS', 'GraphQL'],
                education: [
                    { degree: 'BSc Computer Science', institution: 'Cairo University', year: 2018, gpa: 3.6 }
                ],
                experience: [
                    { title: 'Senior Backend Developer', company: 'Fawry', duration: '3 years', current: true },
                    { title: 'Backend Developer', company: 'Instabug', duration: '2 years', current: false }
                ],
                tags: ['top-talent', 'available-immediately'],
                companyId: techCorp.id,
                jobId: seniorDevJob.id,
            },
        }),
        prisma.candidate.create({
            data: {
                fullName: 'Layla Ahmed',
                email: 'layla.ahmed@outlook.com',
                phone: '+201123456789',
                location: 'Alexandria, Egypt',
                linkedinUrl: 'https://linkedin.com/in/laylaahmed',
                portfolioUrl: 'https://layla-portfolio.vercel.app',
                source: client_1.CandidateSource.UPLOAD,
                status: client_1.CandidateStatus.NEW,
                cvFileUrl: 'https://s3.amazonaws.com/recdesk/cvs/layla-ahmed-cv.pdf',
                cvFileName: 'layla-ahmed-cv.pdf',
                cvText: 'Fresh graduate passionate about frontend development. Skilled in React and modern JavaScript...',
                extractionConfidence: 92,
                overallScore: 75,
                aiSummary: 'Promising fresh graduate with strong portfolio. Good fit for junior position.',
                skills: ['React', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'TailwindCSS'],
                education: [
                    { degree: 'BSc Computer Engineering', institution: 'Alexandria University', year: 2024, gpa: 3.4 }
                ],
                experience: [
                    { title: 'Frontend Intern', company: 'Vodafone Egypt', duration: '6 months', current: false }
                ],
                projects: [
                    { name: 'E-commerce Platform', description: 'Built a full-stack e-commerce site with React and Node.js', url: 'https://github.com/layla/ecommerce' }
                ],
                tags: ['fresh-graduate', 'strong-portfolio'],
                companyId: techCorp.id,
                jobId: juniorDevJob.id,
            },
        }),
        prisma.candidate.create({
            data: {
                fullName: 'Youssef Mahmoud',
                email: 'youssef.m@yahoo.com',
                phone: '+201234567890',
                location: 'Giza, Egypt',
                source: client_1.CandidateSource.JOB_BOARD,
                status: client_1.CandidateStatus.NEW,
                cvFileUrl: 'https://s3.amazonaws.com/recdesk/cvs/youssef-mahmoud-cv.pdf',
                cvFileName: 'youssef-mahmoud-cv.pdf',
                cvText: 'Software developer with 2 years experience in Java and Spring Boot...',
                extractionConfidence: 88,
                overallScore: 58,
                aiSummary: 'Candidate has development experience but different tech stack. May need training.',
                skills: ['Java', 'Spring Boot', 'MySQL', 'REST APIs'],
                education: [
                    { degree: 'BSc Information Technology', institution: 'Ain Shams University', year: 2022, gpa: 3.0 }
                ],
                experience: [
                    { title: 'Java Developer', company: 'Local Startup', duration: '2 years', current: true }
                ],
                tags: ['different-stack'],
                companyId: techCorp.id,
                jobId: seniorDevJob.id,
            },
        }),
        prisma.candidate.create({
            data: {
                fullName: 'Mariam Farouk',
                email: 'mariam.f@gmail.com',
                phone: '+201098765432',
                location: 'Cairo, Egypt',
                linkedinUrl: 'https://linkedin.com/in/mariamfarouk',
                source: client_1.CandidateSource.REFERRAL,
                status: client_1.CandidateStatus.SHORTLISTED,
                cvFileUrl: 'https://s3.amazonaws.com/recdesk/cvs/mariam-farouk-cv.pdf',
                cvFileName: 'mariam-farouk-cv.pdf',
                cvText: 'Digital marketing specialist with 3 years of experience in SEO, social media, and content marketing...',
                extractionConfidence: 94,
                overallScore: 82,
                aiSummary: 'Excellent marketing background with proven results. Strong cultural fit.',
                skills: ['Digital Marketing', 'SEO', 'Google Analytics', 'Social Media Marketing', 'Content Strategy', 'Email Marketing'],
                education: [
                    { degree: 'BA Marketing', institution: 'American University in Cairo', year: 2021, gpa: 3.5 }
                ],
                experience: [
                    { title: 'Digital Marketing Manager', company: 'Jumia Egypt', duration: '2 years', current: true },
                    { title: 'Marketing Coordinator', company: 'Local Agency', duration: '1 year', current: false }
                ],
                certifications: [
                    { name: 'Google Analytics Certified', year: 2022 },
                    { name: 'HubSpot Content Marketing', year: 2023 }
                ],
                tags: ['experienced', 'referred'],
                companyId: startupXYZ.id,
                jobId: marketingJob.id,
            },
        }),
        prisma.candidate.create({
            data: {
                fullName: 'Karim Nabil',
                email: 'karim.nabil@hotmail.com',
                phone: '+201187654321',
                location: 'Mansoura, Egypt',
                source: client_1.CandidateSource.UPLOAD,
                status: client_1.CandidateStatus.NEW,
                cvFileUrl: 'https://s3.amazonaws.com/recdesk/cvs/karim-nabil-cv.pdf',
                cvFileName: 'karim-nabil-cv.pdf',
                cvText: 'Recent computer science graduate looking for opportunities in software development...',
                extractionConfidence: 90,
                skills: ['Python', 'Django', 'JavaScript', 'React'],
                education: [
                    { degree: 'BSc Computer Science', institution: 'Mansoura University', year: 2024, gpa: 3.2 }
                ],
                tags: ['fresh-graduate', 'unassigned'],
                companyId: techCorp.id,
            },
        }),
    ]);
    console.log('👤 Created candidates');
    await Promise.all([
        prisma.candidateScore.create({
            data: {
                candidateId: candidates[0].id,
                jobId: seniorDevJob.id,
                overallScore: 87,
                skillsMatchScore: 90,
                experienceScore: 85,
                educationScore: 80,
                growthScore: 88,
                bonusScore: 90,
                recommendation: 'Highly recommended for interview',
                scoreExplanation: {
                    skillsMatch: 'Excellent match on Node.js, TypeScript, and PostgreSQL. Has NestJS experience.',
                    experience: 'Strong 6 years of relevant backend experience.',
                    education: 'Solid CS background from Cairo University.',
                    growth: 'Career progression shows consistent growth.',
                    bonus: 'Active GitHub, available immediately.',
                },
            },
        }),
        prisma.candidateScore.create({
            data: {
                candidateId: candidates[1].id,
                jobId: juniorDevJob.id,
                overallScore: 75,
                skillsMatchScore: 85,
                experienceScore: 60,
                educationScore: 78,
                growthScore: 80,
                bonusScore: 75,
                recommendation: 'Good candidate for junior role',
                scoreExplanation: {
                    skillsMatch: 'Has React, JavaScript, TypeScript skills as required.',
                    experience: 'Limited but relevant internship experience.',
                    education: 'Recent graduate with good GPA.',
                    growth: 'Strong portfolio shows initiative.',
                    bonus: 'Has portfolio website.',
                },
            },
        }),
        prisma.candidateScore.create({
            data: {
                candidateId: candidates[2].id,
                jobId: seniorDevJob.id,
                overallScore: 58,
                skillsMatchScore: 40,
                experienceScore: 55,
                educationScore: 65,
                growthScore: 60,
                bonusScore: 50,
                recommendation: 'Consider if willing to invest in training',
                scoreExplanation: {
                    skillsMatch: 'Different tech stack (Java vs Node.js). Would need retraining.',
                    experience: 'Has development experience but not in required technologies.',
                    education: 'IT background is acceptable.',
                    growth: 'Steady career so far.',
                    bonus: 'No standout factors.',
                },
            },
        }),
        prisma.candidateScore.create({
            data: {
                candidateId: candidates[3].id,
                jobId: marketingJob.id,
                overallScore: 82,
                skillsMatchScore: 88,
                experienceScore: 80,
                educationScore: 85,
                growthScore: 78,
                bonusScore: 82,
                recommendation: 'Strong candidate, recommend interview',
                scoreExplanation: {
                    skillsMatch: 'Excellent match on digital marketing skills.',
                    experience: 'Relevant experience at Jumia.',
                    education: 'Marketing degree from AUC.',
                    growth: 'Good career progression.',
                    bonus: 'Referred candidate with certifications.',
                },
            },
        }),
    ]);
    console.log('📈 Created candidate scores');
    await Promise.all([
        prisma.candidateStage.create({
            data: {
                candidateId: candidates[0].id,
                stageId: seniorDevStages[1].id,
            },
        }),
        prisma.candidateStage.create({
            data: {
                candidateId: candidates[1].id,
                stageId: juniorDevStages[0].id,
            },
        }),
        prisma.candidateStage.create({
            data: {
                candidateId: candidates[2].id,
                stageId: seniorDevStages[0].id,
            },
        }),
    ]);
    console.log('🔄 Created candidate stage assignments');
    await Promise.all([
        prisma.candidateNote.create({
            data: {
                content: 'Spoke with candidate. Very enthusiastic about the role. Available to start immediately.',
                candidateId: candidates[0].id,
                userId: recruiterUser.id,
            },
        }),
        prisma.candidateNote.create({
            data: {
                content: 'Strong portfolio reviewed. Frontend skills look solid for a junior position.',
                candidateId: candidates[1].id,
                userId: recruiterUser.id,
            },
        }),
    ]);
    console.log('📝 Created candidate notes');
    await Promise.all([
        prisma.emailTemplate.create({
            data: {
                name: 'Application Received',
                subject: 'Thank you for applying to {{job_title}} at {{company_name}}',
                body: `Dear {{candidate_name}},

Thank you for applying for the {{job_title}} position at {{company_name}}.

We have received your application and our team is currently reviewing it. We will get back to you within the next few days.

Best regards,
The {{company_name}} Hiring Team`,
                type: client_1.EmailTemplateType.CUSTOM,
                isDefault: true,
                companyId: techCorp.id,
            },
        }),
        prisma.emailTemplate.create({
            data: {
                name: 'Rejection - After Review',
                subject: 'Update on your application for {{job_title}}',
                body: `Dear {{candidate_name}},

Thank you for your interest in the {{job_title}} position at {{company_name}} and for taking the time to apply.

After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.

We appreciate your interest in our company and wish you the best in your job search.

Best regards,
The {{company_name}} Hiring Team`,
                type: client_1.EmailTemplateType.REJECTION,
                isDefault: true,
                companyId: techCorp.id,
            },
        }),
        prisma.emailTemplate.create({
            data: {
                name: 'Interview Invitation',
                subject: 'Interview Invitation for {{job_title}} at {{company_name}}',
                body: `Dear {{candidate_name}},

We are pleased to invite you for an interview for the {{job_title}} position at {{company_name}}.

Please reply to this email with your availability for the coming week, and we will schedule the interview accordingly.

We look forward to speaking with you!

Best regards,
The {{company_name}} Hiring Team`,
                type: client_1.EmailTemplateType.INTERVIEW_INVITE,
                isDefault: true,
                companyId: techCorp.id,
            },
        }),
    ]);
    console.log('📧 Created email templates');
    await Promise.all([
        prisma.candidateAction.create({
            data: {
                action: 'moved_to_stage',
                details: { from: 'New', to: 'Screening' },
                candidateId: candidates[0].id,
                userId: recruiterUser.id,
            },
        }),
        prisma.candidateAction.create({
            data: {
                action: 'shortlisted',
                details: { reason: 'Strong match for requirements' },
                candidateId: candidates[3].id,
                userId: startupAdmin.id,
            },
        }),
    ]);
    console.log('📋 Created candidate actions');
    console.log('✅ Seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Companies: 2`);
    console.log(`   Users: 4`);
    console.log(`   Jobs: 3`);
    console.log(`   Candidates: 5`);
    console.log(`   Email Templates: 3`);
    console.log('\n🔐 Test Credentials:');
    console.log('   Admin: admin@techcorp.com.eg / password123');
    console.log('   Recruiter: recruiter@techcorp.com.eg / password123');
    console.log('   Viewer: viewer@techcorp.com.eg / password123');
    console.log('   StartupXYZ Admin: hr@startupxyz.io / password123');
}
main()
    .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map