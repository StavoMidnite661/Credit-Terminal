import asyncio
import logging
import time
from typing import Optional, Dict, Literal

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("StraddleScalper")

class StraddleConfig:
    """Configuration for the Dynamic Straddle Scalper."""
    def __init__(
        self,
        symbol: str = "EURUSD",
        straddle_gap_pips: float = 2.0,       # Distance from current price to place virtual stops
        stop_loss_pips: float = 3.0,          # Fixed SL distance
        take_profit_pips: float = 5.0,        # Target TP distance
        trailing_start_pips: float = 1.0,     # When to start trailing
        trailing_step_pips: float = 0.5,      # Step update size
        velocity_threshold_pips: float = 0.5, # "Frequency" filter: min movement per second to activate
        max_spread_pips: float = 1.0,         # Spread filter
        lot_size: float = 0.01
    ):
        self.symbol = symbol
        self.straddle_gap_pips = straddle_gap_pips
        self.stop_loss_pips = stop_loss_pips
        self.take_profit_pips = take_profit_pips
        self.trailing_start_pips = trailing_start_pips
        self.trailing_step_pips = trailing_step_pips
        self.velocity_threshold_pips = velocity_threshold_pips
        self.max_spread_pips = max_spread_pips
        self.lot_size = lot_size

class MarketData:
    """Simple structure to hold tick data."""
    def __init__(self, bid: float, ask: float, timestamp: float):
        self.bid = bid
        self.ask = ask
        self.timestamp = timestamp
        self.mid = (bid + ask) / 2

class StraddleLogic:
    """
    Core Logic for the Dynamic Straddle Scalper.
    
    Concepts:
    1. Virtual Order Management: We do not place orders with the broker until execution.
    2. Dynamic Caging: We maintain virtual Buy Stop and Sell Stop levels that trail price.
    3. Frequency/Velocity Filter: Logic only activates when price moves fast enough.
    """
    def __init__(self, config: StraddleConfig):
        self.config = config
        self.virtual_buy_stop: Optional[float] = None
        self.virtual_sell_stop: Optional[float] = None
        self.active_position: Optional[Dict] = None  # None, 'BUY', or 'SELL'
        self.last_tick: Optional[MarketData] = None
        self.velocity: float = 0.0
        self.is_active: bool = False

    def on_tick(self, tick: MarketData) -> Optional[Dict]:
        """
        Process a new tick. Returns an order instruction if triggered.
        """
        # 1. Calculate Velocity (Frequency component)
        if self.last_tick:
            dt = tick.timestamp - self.last_tick.timestamp
            if dt > 0:
                price_change_pips = abs(tick.mid - self.last_tick.mid) * 10000 # Assuming 4 digit broker for simplicity
                current_velocity = price_change_pips / dt
                # Smoothing
                self.velocity = (self.velocity * 0.7) + (current_velocity * 0.3)
        
        self.last_tick = tick

        # 2. Check Activation (Velocity Filter)
        if self.velocity < self.config.velocity_threshold_pips:
            if self.is_active and not self.active_position:
                logger.info(f"Velocity dropped ({self.velocity:.2f} < {self.config.velocity_threshold_pips}). Resetting cage.")
                self.reset_cage()
            return None

        if not self.is_active:
            logger.info(f"High Frequency Detected ({self.velocity:.2f}). Activating Cage.")
            self.is_active = True
            self.reset_cage(tick.mid)

        # 3. Manage Straddle Logic
        if self.active_position:
            return self._manage_position(tick)
        else:
            return self._manage_cage(tick)

    def reset_cage(self, current_price: float = None):
        """Resets virtual stops around current price."""
        if current_price is None and self.last_tick:
            current_price = self.last_tick.mid
        
        if current_price:
            gap = self.config.straddle_gap_pips / 10000
            self.virtual_buy_stop = current_price + gap
            self.virtual_sell_stop = current_price - gap
        else:
            self.virtual_buy_stop = None
            self.virtual_sell_stop = None

    def _manage_cage(self, tick: MarketData) -> Optional[Dict]:
        """Trails the virtual stops until one is hit."""
        gap = self.config.straddle_gap_pips / 10000
        
        # Trail entries tight to price
        # Buy Stop trails down if price drops
        if self.virtual_buy_stop and (tick.ask + gap) < self.virtual_buy_stop:
            self.virtual_buy_stop = tick.ask + gap
            
        # Sell Stop trails up if price rises
        if self.virtual_sell_stop and (tick.bid - gap) > self.virtual_sell_stop:
            self.virtual_sell_stop = tick.bid - gap

        # Check for Breaches
        if self.virtual_buy_stop and tick.ask >= self.virtual_buy_stop:
            logger.info(f"Virtual BUY STOP triggered at {tick.ask}")
            self.active_position = {'side': 'BUY', 'entry': tick.ask, 'sl': tick.ask - (self.config.stop_loss_pips/10000)}
            return {'action': 'OPEN_BUY', 'price': tick.ask, 'sl': self.active_position['sl']}

        if self.virtual_sell_stop and tick.bid <= self.virtual_sell_stop:
            logger.info(f"Virtual SELL STOP triggered at {tick.bid}")
            self.active_position = {'side': 'SELL', 'entry': tick.bid, 'sl': tick.bid + (self.config.stop_loss_pips/10000)}
            return {'action': 'OPEN_SELL', 'price': tick.bid, 'sl': self.active_position['sl']}
            
        return None

    def _manage_position(self, tick: MarketData) -> Optional[Dict]:
        """Manages an active position (Trailing Stop)."""
        if not self.active_position:
            return None
            
        pips = 0.0001
        sl = self.active_position['sl']
        
        if self.active_position['side'] == 'BUY':
            profit = tick.bid - self.active_position['entry']
            # Hard Stop Logic
            if tick.bid <= sl:
                logger.info("STOP LOSS hit (BUY)")
                self.active_position = None
                self.reset_cage(tick.mid)
                return {'action': 'CLOSE_BUY'}
            
            # Trail Logic
            if profit > (self.config.trailing_start_pips * pips):
                new_sl = tick.bid - (self.config.trailing_step_pips * pips)
                if new_sl > sl:
                    self.active_position['sl'] = new_sl
                    logger.info(f"Trailing SL Updated to {new_sl}")
                    return {'action': 'MODIFY_SL', 'sl': new_sl}

        elif self.active_position['side'] == 'SELL':
            profit = self.active_position['entry'] - tick.ask
             # Hard Stop Logic
            if tick.ask >= sl:
                logger.info("STOP LOSS hit (SELL)")
                self.active_position = None
                self.reset_cage(tick.mid)
                return {'action': 'CLOSE_SELL'}
                
            # Trail Logic
            if profit > (self.config.trailing_start_pips * pips):
                new_sl = tick.ask + (self.config.trailing_step_pips * pips)
                if new_sl < sl:
                    self.active_position['sl'] = new_sl
                    logger.info(f"Trailing SL Updated to {new_sl}")
                    return {'action': 'MODIFY_SL', 'sl': new_sl}

        return None

# --- Mock Integration for Testing ---
async def run_simulation():
    config = StraddleConfig(velocity_threshold_pips=0.1)
    bot = StraddleLogic(config)
    
    # Simulate a price spike (High Frequency Event)
    price = 1.1000
    print("Starting Simulation...")
    
    for i in range(20):
        # Normal low vol
        if i < 5:
            price += 0.00002
        # EXPLOSION (News event)
        elif 5 <= i < 10:
            price += 0.0005 # 5 pips per tick jump!
        # Reversion
        elif 10 <= i < 15:
            price -= 0.0002
        else:
            price += 0.00005
            
        tick = MarketData(bid=price, ask=price+0.0001, timestamp=time.time() + i)
        action = bot.on_tick(tick)
        
        print(f"T={i} | Price={price:.5f} | Vel={bot.velocity:.2f} | Active={bot.is_active} | Action={action}")
        await asyncio.sleep(0.1)

if __name__ == "__main__":
    asyncio.run(run_simulation())
