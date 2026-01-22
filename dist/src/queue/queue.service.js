"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var QueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const queue_constants_1 = require("./queue.constants");
let QueueService = QueueService_1 = class QueueService {
    cvProcessingQueue;
    emailClassificationQueue;
    scoringQueue;
    logger = new common_1.Logger(QueueService_1.name);
    constructor(cvProcessingQueue, emailClassificationQueue, scoringQueue) {
        this.cvProcessingQueue = cvProcessingQueue;
        this.emailClassificationQueue = emailClassificationQueue;
        this.scoringQueue = scoringQueue;
    }
    async addCvProcessingJob(data) {
        this.logger.log(`Adding CV processing job for candidate ${data.candidateId}`);
        return this.cvProcessingQueue.add('process-cv', data, {
            priority: 2,
        });
    }
    async addBulkCvProcessingJobs(jobs) {
        this.logger.log(`Adding ${jobs.length} CV processing jobs`);
        const jobsToAdd = jobs.map((data) => ({
            name: 'process-cv',
            data,
            opts: { priority: 2 },
        }));
        return this.cvProcessingQueue.addBulk(jobsToAdd);
    }
    async addEmailClassificationJob(data) {
        this.logger.log(`Adding email classification job for message ${data.messageId}`);
        return this.emailClassificationQueue.add('classify-email', data, {
            priority: 1,
        });
    }
    async addScoringJob(data) {
        this.logger.log(`Adding scoring job for candidate ${data.candidateId}`);
        return this.scoringQueue.add('score-candidate', data, {
            priority: 2,
        });
    }
    async addBulkScoringJobs(jobs) {
        this.logger.log(`Adding ${jobs.length} scoring jobs`);
        const jobsToAdd = jobs.map((data) => ({
            name: 'score-candidate',
            data,
            opts: { priority: 3 },
        }));
        return this.scoringQueue.addBulk(jobsToAdd);
    }
    async getQueueStats() {
        const [cvProcessing, emailClassification, scoring] = await Promise.all([
            this.getQueueInfo(this.cvProcessingQueue),
            this.getQueueInfo(this.emailClassificationQueue),
            this.getQueueInfo(this.scoringQueue),
        ]);
        return {
            cvProcessing,
            emailClassification,
            scoring,
        };
    }
    async getQueueInfo(queue) {
        const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
        ]);
        return {
            name: queue.name,
            waiting,
            active,
            completed,
            failed,
        };
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = QueueService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bull_1.InjectQueue)(queue_constants_1.QUEUE_NAMES.CV_PROCESSING)),
    __param(1, (0, bull_1.InjectQueue)(queue_constants_1.QUEUE_NAMES.EMAIL_CLASSIFICATION)),
    __param(2, (0, bull_1.InjectQueue)(queue_constants_1.QUEUE_NAMES.SCORING)),
    __metadata("design:paramtypes", [Object, Object, Object])
], QueueService);
//# sourceMappingURL=queue.service.js.map