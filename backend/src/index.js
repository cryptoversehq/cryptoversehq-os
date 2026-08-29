const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Connected to Supabase');

// Middleware: Authentication
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.user = user;
  next();
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CryptoVerse API is running!' });
});

// Create payment
app.post('/api/payments/create', authenticate, async (req, res) => {
  const { amount, currency = 'USD', planId } = req.body;
  if (!amount || amount <= 0 || !planId) {
    return res.status(400).json({ error: 'Invalid amount or planId' });
  }
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert({ user_id: req.user.id, amount, currency, plan_id: planId, status: 'pending' })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, paymentId: data.id, checkoutUrl: `/payment/success?ref=${data.id}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Verify payment
app.get('/api/payments/verify/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Payment not found' });
    res.json({ verified: data.status === 'completed', status: data.status, payment: data });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Payment history
app.get('/api/payments/history', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, payments: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Webhook (simple placeholder)
app.post('/api/webhooks/payment', async (req, res) => {
  const { paymentId, status, orderId } = req.body;
  if (!paymentId || !orderId) return res.status(400).json({ error: 'Invalid webhook data' });
  try {
    await supabase.from('payments').update({ status, updated_at: new Date(), external_payment_id: paymentId }).eq('id', orderId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Webhook failed' });
  }
});

app.listen(port, () => {
  console.log(`🚀 CryptoVerse API running on port ${port}`);
});
