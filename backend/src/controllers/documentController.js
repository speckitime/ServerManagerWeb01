const path = require('path');
const db = require('../config/database');
const logger = require('../services/logger');

exports.list = async (req, res) => {
  try {
    const documents = await db('server_documents')
      .where({ server_id: req.params.serverId })
      .leftJoin('users', 'server_documents.updated_by', 'users.id')
      .select('server_documents.*', 'users.username as updated_by_name')
      .orderBy('server_documents.updated_at', 'desc');

    res.json(documents);
  } catch (err) {
    logger.error('List documents error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const document = await db('server_documents')
      .where({ id: req.params.docId, server_id: req.params.serverId })
      .first();

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const attachments = await db('document_attachments')
      .where({ document_id: document.id })
      .orderBy('created_at', 'desc');

    const versions = await db('document_versions')
      .where({ document_id: document.id })
      .leftJoin('users', 'document_versions.changed_by', 'users.id')
      .select('document_versions.*', 'users.username as changed_by_name')
      .orderBy('document_versions.version', 'desc');

    res.json({ ...document, attachments, versions });
  } catch (err) {
    logger.error('Get document error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const { title, content } = req.body;

    const [doc] = await db('server_documents')
      .insert({
        server_id: req.params.serverId,
        title,
        content,
        version: 1,
        updated_by: req.user.id,
      })
      .returning('*');

    await db('document_versions').insert({
      document_id: doc.id,
      version: 1,
      content,
      changed_by: req.user.id,
    });

    res.status(201).json(doc);
  } catch (err) {
    logger.error('Create document error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { title, content } = req.body;

    const existing = await db('server_documents')
      .where({ id: req.params.docId, server_id: req.params.serverId })
      .first();

    if (!existing) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const newVersion = existing.version + 1;

    const [doc] = await db('server_documents')
      .where({ id: req.params.docId })
      .update({
        title: title || existing.title,
        content: content !== undefined ? content : existing.content,
        version: newVersion,
        updated_by: req.user.id,
      })
      .returning('*');

    if (content !== undefined) {
      await db('document_versions').insert({
        document_id: doc.id,
        version: newVersion,
        content,
        changed_by: req.user.id,
      });
    }

    res.json(doc);
  } catch (err) {
    logger.error('Update document error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await db('server_documents')
      .where({ id: req.params.docId, server_id: req.params.serverId })
      .del();

    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    logger.error('Delete document error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const document = await db('server_documents')
      .where({ id: req.params.docId, server_id: req.params.serverId })
      .first();

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const [attachment] = await db('document_attachments')
      .insert({
        document_id: document.id,
        filename: req.file.filename,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        file_path: req.file.path,
        uploaded_by: req.user.id,
      })
      .returning('*');

    res.status(201).json(attachment);
  } catch (err) {
    logger.error('Upload attachment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.downloadAttachment = async (req, res) => {
  try {
    const attachment = await db('document_attachments')
      .where({ id: req.params.attachmentId })
      .first();

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.download(attachment.file_path, attachment.original_name);
  } catch (err) {
    logger.error('Download attachment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
