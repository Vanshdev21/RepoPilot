const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({ githubId: {type:Number, required:true, unique:true}, username:String, name:String, avatarUrl:String, githubAccessToken:String }, {timestamps:true});
const repositorySchema = new Schema({ connectedBy:{type:Schema.Types.ObjectId, ref:'User', required:true}, githubRepositoryId:Number, owner:String, name:String, fullName:String, htmlUrl:String, defaultBranch:String, primaryLanguage:String, description:String, visibility:{type:String, default:'public'}, readmeSummary:String, monitoringEnabled:{type:Boolean, default:false}, webhookId:Number, autoApprove:{type:Boolean, default:false}, lastSeenIssueNumber:{type:Number, default:0}, indexingStatus:{type:String, default:'pending', enum:['pending','running','completed','failed']} }, {timestamps:true});
repositorySchema.index({connectedBy:1, githubRepositoryId:1}, {unique:true});

const runSchema = new Schema({
  userId:{type:Schema.Types.ObjectId, ref:'User', required:true}, repositoryId:{type:Schema.Types.ObjectId, ref:'Repository', required:true}, runId:String,
  issueNumber:Number, issueSnapshot:Schema.Types.Mixed, status:{type:String, default:'queued', enum:['queued','analyzing','investigating','patch_generated','ready_for_review','testing','approved','published','failed','not_actionable']},
  classification:String, summary:String, rootCause:String, relevantFiles:[String], generatedPatch:String, patchSha256:String, baseCommitSha:String,
  testResults:Schema.Types.Mixed, approvalState:{type:String, default:'pending', enum:['pending','approved','rejected','not_required']}, confidence:Number, validationNotes:String, suggestedTestCommand:String, workspace:String, pullRequest:Schema.Types.Mixed, error:Schema.Types.Mixed
}, {timestamps:true});
runSchema.index({userId:1, createdAt:-1});
runSchema.index({repositoryId:1, issueNumber:1, createdAt:-1});
runSchema.index({runId:1},{unique:true, sparse:true});

const eventSchema = new Schema({ runId:{type:Schema.Types.ObjectId,index:true}, seq:Number, type:String, message:String, payload:Schema.Types.Mixed }, {timestamps:true});
const approvalSchema = new Schema({ runId:{type:Schema.Types.ObjectId,index:true}, userId:Schema.Types.ObjectId, patchSha256:String, baseCommitSha:String }, {timestamps:true});

module.exports = {
  User: mongoose.models.User || mongoose.model('User', userSchema), Repository: mongoose.models.Repository || mongoose.model('Repository', repositorySchema),
  AgentRun: mongoose.models.AgentRun || mongoose.model('AgentRun', runSchema), AgentEvent: mongoose.models.AgentEvent || mongoose.model('AgentEvent', eventSchema), Approval: mongoose.models.Approval || mongoose.model('Approval', approvalSchema)
};
