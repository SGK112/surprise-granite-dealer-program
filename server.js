const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { name, business, email, phone, serviceArea, tier, priceId } = req.body;

    // Create customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { business, phone, serviceArea, tier }
    });

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: 'https://surprisegranite.com/dealer-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://surprisegranite.com/dealer-program',
      discounts: [{
        coupon: 'YOUR_COUPON_ID' // 50% off first month, see Step 3
      }]
    });

    // Save to Thryv
    const thryvResponse = await fetch('https://api.thryv.com/v1/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.THRYV_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        first_name: name.split(' ')[0],
        last_name: name.split(' ').slice(1).join(' ') || ' ',
        email,
        phone,
        company: business,
        address: { city: serviceArea },
        notes: `Dealer Plan: ${tier}`
      })
    });
    if (!thryvResponse.ok) throw new Error('Failed to save to Thryv');

    res.json({ sessionId: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook to handle post-checkout events (optional, for future use)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      console.log('Checkout session completed:', event.data.object);
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
