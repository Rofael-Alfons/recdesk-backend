"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateCandidateDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_candidate_dto_1 = require("./create-candidate.dto");
class UpdateCandidateDto extends (0, swagger_1.PartialType)(create_candidate_dto_1.CreateCandidateDto) {
}
exports.UpdateCandidateDto = UpdateCandidateDto;
//# sourceMappingURL=update-candidate.dto.js.map