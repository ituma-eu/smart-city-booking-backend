const Post = require("../entities/post/post");
const PostModel = require("./models/postModel");
const { escapeRegex } = require("../utilities/regexUtils");

// Public reads only ever return published posts that are not flagged
// company-dashboard-only.
function publicQuery(tenantId) {
  return { tenantId, published: true, companyDashboardOnly: { $ne: true } };
}

class PostManager {
  static async listPublished(tenantId, { audience, tag, q, limit } = {}) {
    const query = publicQuery(tenantId);
    if (audience) {
      query.audience = { $in: [audience, "all"] };
    }
    if (tag) {
      query.tags = tag;
    }
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      query.$or = [{ title: rx }, { excerpt: rx }];
    }
    let cursor = PostModel.find(query).sort({ publishedAt: -1, created: -1 });
    if (limit) {
      cursor = cursor.limit(limit);
    }
    const raw = await cursor;
    return raw.map((doc) => doc.toEntity());
  }

  static async getPublishedBySlug(tenantId, slug) {
    const raw = await PostModel.findOne({ ...publicQuery(tenantId), slug });
    return raw ? raw.toEntity() : null;
  }

  static async publishedTags(tenantId) {
    return PostModel.distinct("tags", publicQuery(tenantId));
  }

  // Company-dashboard feed: published posts aimed at companies (audience
  // companies/all), including the ones flagged company-dashboard-only that the
  // public reads never return.
  static async listForCompany(tenantId) {
    const raw = await PostModel.find({
      tenantId,
      published: true,
      audience: { $in: ["companies", "all"] },
    }).sort({ publishedAt: -1, created: -1 });
    return raw.map((doc) => doc.toEntity());
  }

  static async listAll(tenantId) {
    const raw = await PostModel.find({ tenantId }).sort({ created: -1 });
    return raw.map((doc) => doc.toEntity());
  }

  static async getById(tenantId, id) {
    const raw = await PostModel.findOne({ tenantId, id });
    return raw ? raw.toEntity() : null;
  }

  static async getBySlug(tenantId, slug) {
    const raw = await PostModel.findOne({ tenantId, slug });
    return raw ? raw.toEntity() : null;
  }

  static async store(post, upsert = true) {
    const entity = post instanceof Post ? post : new Post(post);
    entity.validate();
    await PostModel.updateOne({ id: entity.id }, { ...entity }, { upsert });
    return entity;
  }

  static async remove(tenantId, id) {
    await PostModel.deleteOne({ tenantId, id });
  }
}

module.exports = PostManager;
