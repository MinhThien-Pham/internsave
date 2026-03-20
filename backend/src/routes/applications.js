const express = require('express');
const { Status, Platform } = require('@prisma/client');
const prisma = require('../db');

const router = express.Router();

const allowedStatus = new Set(Object.values(Status));
const allowedPlatform = new Set(Object.values(Platform));

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

router.get('/', async (req, res) => {
  try {
    const applications = await prisma.application.findMany({
      orderBy: { created_at: 'desc' }
    });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id }
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      employer,
      title,
      location,
      applied_at,
      status,
      platform,
      job_url,
      notes
    } = req.body;

    if (!employer || !title || !platform) {
      return res.status(400).json({ error: 'employer, title, and platform are required' });
    }

    if (!allowedPlatform.has(platform)) {
      return res.status(400).json({ error: 'Invalid platform value' });
    }

    if (status && !allowedStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const application = await prisma.application.create({
      data: {
        employer,
        title,
        location: location || null,
        applied_at: parseDate(applied_at),
        status: status || 'Saved',
        platform,
        job_url: job_url || null,
        notes: notes || null
      }
    });

    res.status(201).json(application);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create application' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const {
      employer,
      title,
      location,
      applied_at,
      status,
      platform,
      job_url,
      notes
    } = req.body;

    const existing = await prisma.application.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (status && !allowedStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    if (platform && !allowedPlatform.has(platform)) {
      return res.status(400).json({ error: 'Invalid platform value' });
    }

    const updated = await prisma.application.update({
      where: { id: req.params.id },
      data: {
        employer: employer !== undefined ? employer : existing.employer,
        title: title !== undefined ? title : existing.title,
        location: location !== undefined ? location : existing.location,
        applied_at: applied_at !== undefined ? parseDate(applied_at) : existing.applied_at,
        status: status !== undefined ? status : existing.status,
        platform: platform !== undefined ? platform : existing.platform,
        job_url: job_url !== undefined ? job_url : existing.job_url,
        notes: notes !== undefined ? notes : existing.notes
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update application' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.application.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    await prisma.application.delete({ where: { id: req.params.id } });
    res.json({ message: 'Application deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

module.exports = router;
