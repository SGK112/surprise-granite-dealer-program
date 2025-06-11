require 'sinatra'
require 'stripe'
require 'json'
require 'net/http'
require 'uri'
require 'dotenv/load'

# Configure Stripe
Stripe.api_key = ENV['STRIPE_SECRET_KEY']
Stripe.api_version = '2022-11-15'

set :port, ENV['PORT'] || 4242
set :bind, '0.0.0.0'
set :public_folder, 'public'

YOUR_DOMAIN = ENV['YOUR_DOMAIN'] || 'https://surprise-granite-connections-dev.onrender.com'

post '/api/create-customer' do
  content_type 'application/json'
  begin
    customer = Stripe::Customer.create(
      email: params[:email],
      name: params[:name]
    )
    { id: customer.id }.to_json
  rescue Stripe::StripeError => e
    status 500
    { error: e.message }.to_json
  end
end

post '/api/create-subscription' do
  content_type 'application/json'
  begin
    subscription = Stripe::Subscription.create(
      customer: params[:customerId],
      items: [{ price: ENV['STRIPE_PRICE_ID'] }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    )
    {
      clientSecret: subscription.latest_invoice.payment_intent.client_secret
    }.to_json
  rescue Stripe::StripeError => e
    status 500
    { error: e.message }.to_json
  end
end

post '/api/save-to-thryv' do
  content_type 'application/json'
  begin
    uri = URI('https://api.thryv.com/v1/contacts')
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    request = Net::HTTP::Post.new(uri.path)
    request['Authorization'] = "Bearer #{ENV['THRYV_API_KEY']}"
    request['Content-Type'] = 'application/json'
    request.body = {
      first_name: params[:name].split(' ')[0],
      last_name: params[:name].split(' ').slice(1..-1).join(' ') || ' ',
      email: params[:email],
      phone: params[:phone],
      company: params[:business],
      address: { city: params[:serviceArea] }
    }.to_json

    response = http.request(request)
    if response.code == '201'
      { status: 'success' }.to_json
    else
      status 500
      { error: "Thryv API error: #{response.body}" }.to_json
    end
  rescue StandardError => e
    status 500
    { error: e.message }.to_json
  end
end
