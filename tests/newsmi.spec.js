const { compile, transform, parse } = require("../lit-nunjucks");
const babel = require("@babel/parser");
const { default: generate } = require("@babel/generator");

const sources = {
    "change-date": `
    <div class="og-change-shipment-date-button pe-2">
    <button class="btn btn-primary og-primary" data-bs-target="#og-change-date{{ order.public_id }}" data-bs-toggle="modal" type="button">
      {{ shipment_change_date_button }}
    </button>
    <div aria-hidden="true" aria-labelledby="exampleModalLabel" class="modal fade" id="og-change-date{{ order.public_id }}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ modal_change_date_header }}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="{{ modal_close }}">{{ modal_close }}</button>
          </div>
          <div class="modal-body">
            <input type="date" value="{{ order.place }}" id="og-change-shipment-date-input-{{ order.public_id }}"/>
          </div>
          <div class="modal-footer">
            <og-change-shipment-date date-input="#og-change-shipment-date-input-{{ order.public_id }}" order="{{ order.public_id }}" class="btn btn-primary og-primary" data-bs-dismiss="modal">
              {{ modal_change_date_save }}
            </og-change-shipment-date>
          </div>
        </div>
      </div>
    </div>
  </div>    
    `,
    main: `
  <div class="container">
    <div id="og-msi">
      {% if customer.authorized %} 
        <div class="og-msi">
          <section aria-labelledby="og-msi-main-title" class="og-msi-main-header">
            <h1 id="og-msi-main-title" class="og-msi-main-title">
              {{ msi_main_title }}
            </h1>
            <p class="og-msi-main-text ng-scope">
              {{ msi_main_text }}
            </p>
  
            {% include 'orders-processing' %}
            {% include 'orders-unsent' %}
          </section>
        </div>
  
      {% else %}
        <div class="og-message-main" id="og-no-shipment-message">
          {{ not_a_subscriber }}
          <a href="{{ url_learn_more }}" class="og-button">
            {{ text_learn_more }}
          </a>
        </div>
      {% endif %}
    </div>
  </div>
      
    `,
    "orders-processing": `
    <section aria-labelledby="shipments-sent-header" id="og-sent-shipments">

    {#
      Iterate over all orders
    #}
    {% for order in orders %}
  
      {#
        The markup within this if block is displayed for all sent orders
      #}
      {% if order.status == 'SENT' %}
  
        {#
          If at least one sent order exists, display a sent shipment header
        #}
        {% if index == 1 %}
          <h1 class="og-title" id="shipments-sent-header">
            {{ shipment_sent_processing }}
          </h1>
          <div class="og-sent-shipment-info">
            {{ shipment_sent_subheader }}
          </div>    
        {% endif %}
        {% set order_id = order.public_id %}
        {% set order_items = items_by_order[order_id] %}
        {% set payment_id = order.payment %}
        {% set payment = payment_by_id[payment_id] %}
        {% set shipping_address_id = order.shipping_address %}
        {% set shipping_address = address_by_id[shipping_address_id] %}
        <div class="og-sent-shipment">
  
          {#
            Shipment header
          #}
          <div class="og-shipment-header" data-shipment-id="{{ order.public_id }}">
            <div class="og-shipment-info">
              <span class="og-shipment-on">{{ shipment_unsent_header }}</span>
              <h2 class="og-shipment-place">{{ order.place | date }}</h2>
            </div>
  
            <div class="og-sent-shipment-info">
              {{shipment_sent_subheader}}
            </div>
          </div>
  
          {#
            Shipment body
          #}
          <div class="og-shipment-body">
  
            {#
              Iterate over all order items in the order
            #}
            {% for order_item in order_items %}
              {% set product_id = order_item.product %}
              {% set product = product_by_id[product_id] %}
  
              {#
                Order item
              #}
              <div class="" og-item-id="{{ order_item.public_id }}" og-subscription-id="{{ order_item.subscription }}">
                <div class="og-product-info-upcoming">
                  {% if product %}
                    <div class="og-product-image-container">
                      <img class="og-product-image" loading="lazy" alt="{{ product.name }}" src="{{ product.image_url | ifDefined }}" width="200" height="200"/>
                    </div>
  
                    <div class="og-description-and-controls">
                      <div class="og-product-description">
                        <h3 class="og-product-name">
                          <a href="{{ product.detail_url | ifDefined }}">{{ product.name }}</a>
                        </h3>
  
                        {{ product.display_name }}
  
                        <div class="og-sku-swap-wrapper ng-scope">
                          <og-sku-swap subscription="{{ order_item.subscription }}"></og-sku-swap>
                        </div>
                      </div>
                    </div>
                  {% endif %}
                  <div class="og-price">
  
                    {#
                      The markup within this if block is displayed if the final price represents a
                      discount from the original price
                    #}
                    {% if order_item.show_original_price %}
                      <span class="og-strike og-base-unit-price" style="text-decoration: line-through">
                        {{ order_item.price | currency }}
                      </span>
                    {% endif %}
                    <span class="og-final-unit-price">
                      {{ order_item.total_price | currency }}
                    </span>
                    <span>
                      {{ product_price_each }}
                    </span>
                  </div>
                </div>
              </div>
  
              {#
                Quantity control
              #}
              <div class="og-freq-quantity-controls">
                <div class="og-quantity og-wrapper">
                  {{ item_controls_sending }}
                  <og-subscription-quantity subscription="{{ order_item.subscription }}"></subscription-quantity>
                </div>
  
                {#
                  Frequency control
                #}
                <div class="og-freq og-wrapper">
                  {{ item_controls_every }}
                  <og-subscription-frequency subscription="{{ order_item.subscription }}"></og-subscription-frequency>
                </div>
              </div>
  
            {% endfor %}
          </div>
  
          {#
            Shipment footer
          #}
          <div class="og-shipment-footer">
            <div class="og-payment-shipping">
  
              {#
                Payment info
              #}
              <div class="og-billing">
                <div>
                  <div class="og-footer-header">
                    {{ shipment_unsent_footer_billing_header }}
                  </div>
  
                  <div og-payment-id="{{payment.public_id}}">
                    <div>
                      <span class="og-payment-type">{{ payment.cc_type }}</span>
                    </div>
                    <div class="og-payment-expiration-date">
                      {% if payment.public_id %}
                        {{ form_billing_expiration_date }}{{ payment.cc_exp_date }}
                      {% endif %}
                    </div>
                  </div>
                </div>
              </div>
  
              {#
                Shipping info
              #}
              <div class="og-shipping">
                <div>
                  <div class="og-footer-header">
                    {{shipment_unsent_footer_shipping_header}}
                  </div>
                  <div og-address-id="{{shipping_address.public_id}}">
                    <div class="og-address-name">{{ shipping_address.first_name }}
                      {{ shipping_address.last_name }}</div>
                    <div class="og-address-line-1">{{ shipping_address.address }}</div>
                    <div class="og-address-line-2">{{ shipping_address.address2 }}</div>
                    <div class="og-address-city-state-zip">
                      {{ shipping_address.city }},
                      {{ shipping_address.state_province_code }}
                      {{ shipping_address.zip_postal_code }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
  
            {#
              Order pricing details
            #}
            <table role="grid">
              <caption class="og-shipment-summary-pricing-caption"></caption>
              <tr class="og-pricing-line og-shipment-discount-total">
                <th class="og-total-label" scope="row">{{ shipment_sent_price_autosave }}</th>
                <td class="og-total-value">{{ order.discount_total | currency }}</td>
              </tr>
              <tr class="og-pricing-line og-shipment-sub-total">
                <th class="og-total-label" scope="row">{{ shipment_sent_price_subtotal }}</th>
                <td class="og-total-value">{{ order.sub_total | currency }}</td>
              </tr>
              <tr class="og-pricing-line og-shipment-tax-total">
                <th class="og-total-label" scope="row">{{ shipment_sent_price_tax }}</th>
                <td class="og-total-value">{{ order.tax_total | currency }}</td>
              </tr>
              <tr class="og-pricing-line og-shipment-shipping-total">
                <th class="og-total-label" scope="row">{{ shipment_sent_price_shipping }}</th>
                <td class="og-total-value">{{ order.shipping_total | currency }}</td>
              </tr>
              <tr class="og-pricing-line og-shipment-total">
                <th class="og-total-label" scope="row">{{ shipment_sent_price_total }}</th>
                <td class="og-total-value">{{ order.total | currency }}</td>
              </tr>
              <tr class="og-total-box-disclaimer">
                <td colspan="2">
                  <small>{{ total_box_disclaimer }}</small>
                </td>
              </tr>
            </table>
          </div>
        </div>
      {% endif %}
    {% endfor %}
  
  </section>    `,
    "orders-unsent": `<section
  id="og-unsent-shipments"
  aria-labelledBy="shipments-unsent-header"
>

  {#
    Iterate over all unsent orders
  #}
  {% for order in orders %}
    {% if order.status == 'UNSENT' %}

      {#
        If at least one sent order exists, display an unsent shipment header
      #}
      {% if index == 1 %}
        <h1 class="og-title" id="shipments-unsent-header">
          {{ shipments_unsent_header }}
        </h1>
      {% endif %}
      {% set order_id = order.public_id %}
      {% set order_items = items_by_order[order_id] %}
      {% set payment_id = order.payment %}
      {% set payment = payment_by_id[payment_id] %}
      {% set shipping_address_id = order.shipping_address %}
      {% set shipping_address = address_by_id[shipping_address_id] %}

      {#
        Unsent shipment
      #}
      <div class="og-unsent-shipment">

        {#
          Shipment header
        #}
        <div
          class="og-shipment-header"
          data-shipment-id="{{ order.public_id }}"
        >
          <div class="og-shipment-info">
            <span class="og-shipment-on">{{ shipment_unsent_header }}</span>
            <h2 class="og-shipment-place">{{ order.place | date }}</h2>
          </div>
    
          {#
            Shipment controls
          #}
          <div class="og-shipment-header-controls d-flex">
            <div class="og-flex og-shipment-actions">
              {% include 'send-now' %} 
              {% include 'change-date' %} 
              {% include 'skip' %}
              </div>
          </div>
        </div>
    
        {#
          Shipment body
        #}
        <div class="og-shipment-body">
          {#
            Iterate over all order items in the order
          #}
          {% for order_item in order_items %}
            {% set product_id = order_item.product %}
            {% set product = product_by_id[product_id] %}
            {% set subscription_id = order_item.subscription %}
            {% set subscription = subscription_by_id[subscription_id] %}
            <div class="og-flex">
            {#
              Order item
            #}
            <div class="" og-item-id="{{ order_item.public_id }}" og-subscription-id="{{ order_item.subscription }}">
                <div class="og-product-info-upcoming">
                    {% if product %}
                      <div class="og-product-image-container">
                        <img
                          class="og-product-image"
                          loading="lazy"
                          alt="{{ product.name }}"
                          src="{{ product.image_url | ifDefined }}"
                          width="200"
                          height="200"
                        />
                      </div>

                      <div class="og-description-and-controls">
                        <div class="og-product-description">
                          <h3 class="og-product-name">
                            <a href="{{ product.detail_url | ifDefined }}">{{ product.name }}</a>
                          </h3>

                          {{ product.display_name }}


                          <div class="og-price">
                            {#
                              If the final price is less than the original price, show the original price
                              with a strikethrough
                            #}
                            {% if order_item.show_original_price %}
                                <span class="og-strike og-base-unit-price" style="text-decoration: line-through">
                                    {{ order_item.price | currency }}
                                </span>
                            {% endif %}
                            <span class="og-final-unit-price">
                                {{ order_item.total_price | currency }}
                            </span>
                            <span>
                                {{ product_price_each }}
                            </span>
                        </div>

                        <div class="og-sku-swap-wrapper ng-scope">
                            <og-sku-swap subscription="{{ order_item.subscription }}"></og-sku-swap>
                          </div>
                        </div>
                      
                    
                    
                    </div>
                    {% endif %}
                </div>
            </div>
            {% if subscription  %}
              <og-item-controls>
                <div class="og-freq-quantity-controls">

                  {#
                    Quantity control
                  #}
                  
                  <div class="og-quantity og-wrapper">
                      <span>{{ item_controls_sending }} </span>
                      <og-subscription-quantity subscription="{{ order_item.subscription }}"></subscription-quantity>
                  </div>

                  {#
                    Frequency control
                  #}
                  <div class="og-freq og-wrapper">
                      <span>{{ item_controls_every }} </span>
                      <og-subscription-frequency subscription="{{ order_item.subscription }}"></og-subscription-frequency>
                  </div>
                </div>

                {#
                  If the order item has a subscription, display subscription controls
                #}
                <div class="og-item-remove-actions">

                      {#
                        If the order is one-time, display a remove item from order control
                      #}
                      {% if order_items.length is 1 and not order_item.subscription %}
                          <a href="#" class="btn-link">
                              {{ remove_item }}
                          </a>
                      {% endif %}

                      {#
                        Cancel subscription control
                      #}
                      <a class="btn-link" data-bs-toggle="modal" data-bs-target="#og-cancel-{{ order_item.public_id }}">
                          {{ cancel_subscription_button }}
                      </a>

                      {#
                        Pause subscription control
                      #}
                      <a class="btn-link" data-bs-toggle="modal" data-bs-target="#og-pause-{{ order_item.public_id }}">
                          {{ pause_subscription_button }}
                      </a>
                </div>
              </og-item-controls>
            {% endif %}
            </div>
          {% endfor%}
        </div>
        
        {#
          Show an upsell banner beneath the first shipment
        #}
        {% if index == 1 %}
          <div class="og-upsell og-product">
            <div class="og-product-info">
              <div class="og-product-description">
                <h3 class="og-upsell-header">{{ iu_advertisement_header }}</h3>
                <div class="og-upsell-text">{{ iu_advertisement_text }}</div>
                {{ order.public_id }}
              </div>
            </div>
            <div class="og-item-controls-container">
              <a class="og-upsell-button" href="#">
                {{ shop_now_button_text }}
              </a>
            </div>
          </div>
        {% endif %}
    
        {#
          Shipment footer
        #}
        <div class="og-shipment-footer">
          <div class="og-payment-shipping">

            {#
              Payment info
            #}
            <div class="og-billing">
              <div>
                <div class="og-footer-header">
                  {{ shipment_unsent_footer_billing_header }}
                </div>
        
                <div og-payment-id="{{payment.public_id}}">
                  <div>
                    <span class="og-payment-type">{{ payment.cc_type }}</span>
                    {% if payment.cc_number_ending %}<span class="og-payment-last-4">{{ form_billing_ending_in }}{{ payment.cc_number_ending }}</span>{% endif %}
                  </div>
                  <div class="og-payment-expiration-date">
                    {% if payment.public_id %}{{ form_billing_expiration_date }}{{ payment.cc_exp_date }}{% endif %}
                  </div>
                </div>
        
                <a class="og-edit-payment" href="javascript:void(0);">
                  {{ shipment_unsent_footer_billing_edit }}
                </a>
              </div>
            </div>

            {#
              Shipping info
            #}
            <div class="og-shipping">
              <div>
                <div class="og-footer-header">
                  {{ shipment_unsent_footer_shipping_header }}
                </div>
                <div og-address-id="{{shipping_address.public_id}}">
                  <div class="og-address-name">{{ shipping_address.first_name }} {{ shipping_address.last_name }}</div>
                  <div class="og-address-line-1">{{ shipping_address.address }}</div>
                  <div class="og-address-line-2">{{ shipping_address.address2 }}</div>
                  <div class="og-address-city-state-zip">
                    {{ shipping_address.city }}, {{ shipping_address.state_province_code }}
                    {{ shipping_address.zip_postal_code }}
                  </div>
                </div>
                <a class="og-edit-shipping" href="javascript:void(0);">
                  {{ shipment_unsent_footer_shipping_edit }}
                </a>
              </div>
            </div>
          </div>

          {#
            Order pricing details
          #}
          <table role="grid">
            <caption class="og-shipment-summary-pricing-caption">
            </caption>
            <tr class="og-pricing-line og-shipment-discount-total">
              <th class="og-total-label" scope="row">{{ shipment_sent_price_autosave }}</th>
              <td class="og-total-value">{{ order.discount_total | currency }}</td>
            </tr>
            <tr class="og-pricing-line og-shipment-sub-total">
              <th class="og-total-label" scope="row">{{ shipment_sent_price_subtotal }}</th>
              <td class="og-total-value">{{ order.sub_total | currency }}</td>
            </tr>
            <tr class="og-pricing-line og-shipment-tax-total">
              <th class="og-total-label" scope="row">{{ shipment_sent_price_tax }}</th>
              <td class="og-total-value">{{ order.tax_total | currency }}</td>
            </tr>
            <tr class="og-pricing-line og-shipment-shipping-total">
              <th class="og-total-label" scope="row">{{ shipment_sent_price_shipping }}</th>
              <td class="og-total-value">{{ order.shipping_total | currency }}</td>
            </tr>
            <tr class="og-pricing-line og-shipment-total">
              <th class="og-total-label" scope="row">{{ shipment_sent_price_total }}</th>
              <td class="og-total-value">{{ order.total | currency }}</td>
            </tr>
            <tr class="og-total-box-disclaimer">
              <td colspan="2">
                <small>{{ total_box_disclaimer }}</small>
              </td>
            </tr>
          </table>        
        </div>
      </div>
    {% endif %}
  {% endfor %}

</section>
`,
    "send-now": `<div class="og-send-shipment-now-button pe-2">
<button class="btn btn-primary" data-bs-target="#og-{{ order.public_id }}" data-bs-toggle="modal" type="button">
  {{ shipment_send_now_button }}
</button>

<div aria-hidden="true" aria-labelledby="exampleModalLabel" class="modal fade" id="og-{{ order.public_id }}" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{ modal_send_now_header }}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="{{ modal_close }}"></button>
      </div>
      <div class="modal-body">
        {{ modal_send_now_body }}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal" type="button">
          {{ modal_cancel_button }}
        </button>

        <og-send-now order="{{ order.public_id }}" class="btn btn-primary" data-bs-dismiss="modal">{{ modal_send_now_save }}
        </og-send-now>

      </div>
    </div>
  </div>
</div>
</div>
`,
    skip: `<div class="og-skip-shipment-button pe-2">
<button class="btn btn-primary" data-bs-target="#og-skip-shipment-button-{{ order.public_id }}" data-bs-toggle="modal" type="button">
  {{ shipment_skip_button }}
</button>

<div aria-hidden="true" aria-labelledby="exampleModalLabel" class="modal fade" id="og-skip-shipment-button-{{ order.public_id }}" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{ modal_skip_header }}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="{{ modal_close }}"></button>
      </div>
      <div class="modal-body">
        {{ modal_skip_body }}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal" type="button">
          {{ modal_cancel_button }}
        </button>
        <og-skip-button order="{{ order.public_id }}" class="btn btn-primary">{{ modal_skip_shipment_save }}</og-skip-button>
      </div>
    </div>
  </div>
</div>
</div>
`,
};
test("", () => {
    // console.log(compile(sources.main, { partials: sources }));
    console.log(compile(sources['main'], { partials: sources }));
});
