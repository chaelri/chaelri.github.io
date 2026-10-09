"""Monopoly rules engine. Pure: no I/O, no threads. The server owns one Game,
calls its actions under a lock, and broadcasts public() after each.

All money moves happen here, so phones never compute anything: rent, tax, GO,
cards, auctions and debts are settled the moment they happen.

Every action raises GameError with a human sentence when it is not allowed;
the phone shows that sentence as-is.
"""
import math
import random
import secrets
import time

GO_SALARY = 200
JAIL = 10
JAIL_FINE = 50
MAX_PLAYERS = 8
COLORS = ["#e53935", "#1e88e5", "#43a047", "#fdd835", "#8e24aa", "#fb8c00", "#00acc1", "#ec407a"]

GROUPS = {
    "brown": "#8d5524", "lblue": "#8fd3f4", "pink": "#d81b8c", "orange": "#f57c00",
    "red": "#e21b1b", "yellow": "#f6d10b", "green": "#1a9e4a", "dblue": "#1546b0",
}


def _st(name, group, price, rent, house):
    return {"type": "street", "name": name, "group": group, "price": price, "rent": rent, "house": house}


def _rr(name):
    return {"type": "rail", "name": name, "group": "rail", "price": 200}


def _ut(name):
    return {"type": "util", "name": name, "group": "util", "price": 150}


# Manila edition: classic prices and rents, local names.
SQUARES = [
    {"type": "go", "name": "GO"},
    _st("Tondo", "brown", 60, [2, 10, 30, 90, 160, 250], 50),
    {"type": "chest", "name": "Community Chest"},
    _st("Malabon", "brown", 60, [4, 20, 60, 180, 320, 450], 50),
    {"type": "tax", "name": "Income Tax", "amount": 200},
    _rr("LRT-1"),
    _st("Sampaloc", "lblue", 100, [6, 30, 90, 270, 400, 550], 50),
    {"type": "chance", "name": "Chance"},
    _st("Quiapo", "lblue", 100, [6, 30, 90, 270, 400, 550], 50),
    _st("Binondo", "lblue", 120, [8, 40, 100, 300, 450, 600], 50),
    {"type": "jail", "name": "Jail"},
    _st("Pasay", "pink", 140, [10, 50, 150, 450, 625, 750], 100),
    _ut("Meralco"),
    _st("Paranaque", "pink", 140, [10, 50, 150, 450, 625, 750], 100),
    _st("Las Pinas", "pink", 160, [12, 60, 180, 500, 700, 900], 100),
    _rr("LRT-2"),
    _st("Marikina", "orange", 180, [14, 70, 200, 550, 750, 950], 100),
    {"type": "chest", "name": "Community Chest"},
    _st("San Juan", "orange", 180, [14, 70, 200, 550, 750, 950], 100),
    _st("Pasig", "orange", 200, [16, 80, 220, 600, 800, 1000], 100),
    {"type": "parking", "name": "Free Parking"},
    _st("Cubao", "red", 220, [18, 90, 250, 700, 875, 1050], 150),
    {"type": "chance", "name": "Chance"},
    _st("Katipunan", "red", 220, [18, 90, 250, 700, 875, 1050], 150),
    _st("Timog", "red", 240, [20, 100, 300, 750, 925, 1100], 150),
    _rr("MRT-3"),
    _st("Eastwood", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150),
    _st("Ortigas", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150),
    _ut("Maynilad"),
    _st("Alabang", "yellow", 280, [24, 120, 360, 850, 1025, 1200], 150),
    {"type": "gotojail", "name": "Go to Jail"},
    _st("Rockwell", "green", 300, [26, 130, 390, 900, 1100, 1275], 200),
    _st("Greenhills", "green", 300, [26, 130, 390, 900, 1100, 1275], 200),
    {"type": "chest", "name": "Community Chest"},
    _st("Ayala Avenue", "green", 320, [28, 150, 450, 1000, 1200, 1400], 200),
    _rr("PNR"),
    {"type": "chance", "name": "Chance"},
    _st("BGC", "dblue", 350, [35, 175, 500, 1100, 1300, 1500], 200),
    {"type": "tax", "name": "Luxury Tax", "amount": 100},
    _st("Forbes Park", "dblue", 400, [50, 200, 600, 1400, 1700, 2000], 200),
]
BUYABLE = ("street", "rail", "util")
GROUP_SQ = {}
for _i, _s in enumerate(SQUARES):
    if _s["type"] in BUYABLE:
        GROUP_SQ.setdefault(_s["group"], []).append(_i)

CHANCE = [
    {"text": "Advance to Forbes Park.", "a": "move", "to": 39},
    {"text": "Advance to GO. Collect P200.", "a": "move", "to": 0},
    {"text": "Advance to Timog. If you pass GO, collect P200.", "a": "move", "to": 24},
    {"text": "Advance to Pasay. If you pass GO, collect P200.", "a": "move", "to": 11},
    {"text": "Advance to the nearest train line. If owned, pay the owner twice the rent.", "a": "rail"},
    {"text": "Advance to the nearest train line. If owned, pay the owner twice the rent.", "a": "rail"},
    {"text": "Advance to the nearest utility. If owned, roll and pay 10x the dice.", "a": "util"},
    {"text": "Bank pays you a dividend of P50.", "a": "cash", "n": 50},
    {"text": "Get Out of Jail Free. Keep this card until needed.", "a": "goojf"},
    {"text": "Go back 3 spaces.", "a": "back"},
    {"text": "Go to Jail. Do not pass GO, do not collect P200.", "a": "jail"},
    {"text": "General repairs: pay P25 per house, P100 per hotel.", "a": "repairs", "h": 25, "H": 100},
    {"text": "Overspeeding sa EDSA. Pay P15.", "a": "cash", "n": -15},
    {"text": "Take a trip on LRT-1. If you pass GO, collect P200.", "a": "move", "to": 5},
    {"text": "You were elected barangay chairman. Pay each player P50.", "a": "each", "n": -50},
    {"text": "Your building loan matures. Collect P150.", "a": "cash", "n": 150},
]
CHEST = [
    {"text": "Advance to GO. Collect P200.", "a": "move", "to": 0},
    {"text": "Bank error in your favour. Collect P200.", "a": "cash", "n": 200},
    {"text": "Doctor's fee. Pay P50.", "a": "cash", "n": -50},
    {"text": "From sale of stock you get P50.", "a": "cash", "n": 50},
    {"text": "Get Out of Jail Free. Keep this card until needed.", "a": "goojf"},
    {"text": "Go to Jail. Do not pass GO, do not collect P200.", "a": "jail"},
    {"text": "13th month pay! Collect P100.", "a": "cash", "n": 100},
    {"text": "Income tax refund. Collect P20.", "a": "cash", "n": 20},
    {"text": "Birthday mo! Collect P10 from every player.", "a": "each", "n": 10},
    {"text": "Life insurance matures. Collect P100.", "a": "cash", "n": 100},
    {"text": "Hospital fees. Pay P100.", "a": "cash", "n": -100},
    {"text": "Tuition fees. Pay P50.", "a": "cash", "n": -50},
    {"text": "Consultancy fee. Collect P25.", "a": "cash", "n": 25},
    {"text": "Street repairs: pay P40 per house, P115 per hotel.", "a": "repairs", "h": 40, "H": 115},
    {"text": "You won second prize in a beauty contest. Collect P10.", "a": "cash", "n": 10},
    {"text": "You inherit P100.", "a": "cash", "n": 100},
]
DECKS = {"chance": CHANCE, "chest": CHEST}

AUCTION_OPEN_SECS = 20
AUCTION_BID_SECS = 8


class GameError(Exception):
    pass


def peso(n):
    return "P{:,}".format(n)


def unmortgage_cost(i):
    return int(math.ceil(SQUARES[i]["price"] / 2 * 1.1))


class Game:
    def __init__(self, state=None, rng=None, clock=time.time):
        self.rng = rng or random.Random()
        self.clock = clock
        self.s = state if state is not None else self.fresh()

    def fresh(self, settings=None):
        decks = {}
        for k, cards in DECKS.items():
            order = list(range(len(cards)))
            self.rng.shuffle(order)
            decks[k] = order
        return {
            "phase": "lobby",           # lobby | play | over
            "settings": settings or {"start_cash": 1500, "free_parking": False, "auction": True},
            "players": [],
            "props": {},                # "sq" -> {owner, houses (5 = hotel), mortgaged}
            "turn": 0,
            "dice": [0, 0],
            "dbl": 0,                   # doubles rolled this turn
            "again": False,             # current player rolls again after this landing
            "stage": "idle",            # roll | buy | auction | debt | done
            "pending": None,            # {"sq"} while deciding to buy
            "auction": None,
            "debts": [],                # [{id, from, to (pid|"bank"), amount, why}]
            "resume": None,             # what runs once all debts clear
            "trades": [],
            "log": [],
            "logn": 0,
            "card": None,               # last card drawn, for the board popup
            "houses": 32,
            "hotels": 12,
            "pot": 0,                   # Free Parking jackpot (house rule)
            "decks": decks,
            "winner": None,
            "rev": 0,
        }

    # ---------- helpers ----------------------------------------------
    def player(self, pid):
        for p in self.s["players"]:
            if p["id"] == pid:
                return p
        raise GameError("Unknown player.")

    def by_secret(self, secret):
        for p in self.s["players"]:
            if secret and p["secret"] == secret:
                return p
        return None

    def cur(self):
        return self.s["players"][self.s["turn"]]

    def active(self):
        return [p for p in self.s["players"] if not p["out"]]

    def prop(self, i):
        return self.s["props"].get(str(i))

    def owned_by(self, pid):
        return sorted(int(k) for k, v in self.s["props"].items() if v["owner"] == pid)

    def log(self, text, kind="info", deltas=None):
        self.s["logn"] += 1
        self.s["log"].append({"id": self.s["logn"], "t": round(self.clock(), 1), "text": text,
                              "kind": kind, "d": deltas or {}})
        del self.s["log"][:-120]

    def name(self, pid):
        if pid == "bank":
            return "the bank"
        return self.player(pid)["name"]

    def need_play(self):
        if self.s["phase"] != "play":
            raise GameError("The game isn't running.")

    def need_turn(self, p, *stages):
        self.need_play()
        if p["out"]:
            raise GameError("You're out of the game.")
        if self.cur()["id"] != p["id"]:
            raise GameError("It's not your turn.")
        if stages and self.s["stage"] not in stages:
            raise GameError("You can't do that right now.")

    def my_debts(self, p):
        return [d for d in self.s["debts"] if d["from"] == p["id"]]

    def spendable(self, p):
        """Cash minus a winning auction bid, which is already promised."""
        a = self.s["auction"]
        return p["cash"] - (a["high"] if a and a["by"] == p["id"] else 0)

    def owns_group(self, pid, group):
        return all((self.prop(i) or {}).get("owner") == pid for i in GROUP_SQ[group])

    def group_has_houses(self, group):
        return any((self.prop(i) or {}).get("houses", 0) > 0 for i in GROUP_SQ[group])

    def net_worth(self, p):
        n = p["cash"]
        for i in self.owned_by(p["id"]):
            sq, o = SQUARES[i], self.prop(i)
            n += sq["price"] // 2 if o["mortgaged"] else sq["price"]
            if sq["type"] == "street":
                n += o["houses"] * sq["house"]
        return n

    # ---------- money --------------------------------------------------
    def pay_to(self, to, amount):
        if to == "bank":
            if self.s["settings"].get("free_parking"):
                self.s["pot"] += amount
        else:
            self.player(to)["cash"] += amount

    def charge(self, p, to, amount, why):
        """Move money from p to `to` (a pid or "bank"). If p can't cover it, it
        becomes a debt that blocks the game until p raises cash or goes bankrupt."""
        if amount <= 0:
            return True
        if p["cash"] >= amount:
            p["cash"] -= amount
            self.pay_to(to, amount)
            d = {p["id"]: -amount}
            if to != "bank":
                d[to] = amount
            self.log("{} paid {} to {} ({})".format(p["name"], peso(amount), self.name(to), why), "pay", d)
            return True
        self.s["debts"].append({"id": secrets.token_hex(3), "from": p["id"], "to": to,
                                "amount": amount, "why": why})
        self.log("{} owes {} to {} ({}) and must raise cash".format(p["name"], peso(amount), self.name(to), why), "debt")
        return False

    def credit(self, p, amount, why):
        p["cash"] += amount
        self.log("{} got {} ({})".format(p["name"], peso(amount), why), "gain", {p["id"]: amount})

    def settle(self, p=None):
        """Pay off whatever debts can now be paid. Called after anything that raises cash."""
        for d in list(self.s["debts"]):
            if p is not None and d["from"] != p["id"]:
                continue
            payer = self.player(d["from"])
            if payer["cash"] >= d["amount"]:
                self.s["debts"].remove(d)
                self.charge(payer, d["to"], d["amount"], d["why"])
        if not self.s["debts"] and self.s["stage"] == "debt":
            nxt, self.s["resume"] = self.s["resume"], None
            self.run(nxt)

    def proceed(self, nxt):
        if self.s["debts"]:
            self.s["stage"] = "debt"
            self.s["resume"] = nxt
        else:
            self.run(nxt)

    def run(self, nxt):
        k = (nxt or {}).get("k", "after")
        if k == "jailmove":
            self.move_by(self.cur(), nxt["n"])
        else:
            self.after_landing()

    def after_landing(self):
        p = self.cur()
        if self.s["phase"] != "play":
            return
        if p["out"]:
            self.next_turn()
        elif self.s["again"] and not p["jailed"]:
            self.s["stage"] = "roll"
            self.log("{} rolled doubles. Roll again!".format(p["name"]), "turn")
        else:
            self.s["stage"] = "done"

    # ---------- lobby -------------------------------------------------
    def join(self, name, color=None):
        if self.s["phase"] != "lobby":
            raise GameError("The game already started.")
        name = " ".join((name or "").split())[:14]
        if not name:
            raise GameError("Type your name.")
        if len(self.s["players"]) >= MAX_PLAYERS:
            raise GameError("The table is full (8 players).")
        if any(p["name"].lower() == name.lower() for p in self.s["players"]):
            raise GameError("Someone already took that name.")
        taken = {p["color"] for p in self.s["players"]}
        if color not in COLORS or color in taken:
            color = next(c for c in COLORS if c not in taken)
        p = {"id": secrets.token_hex(3), "secret": secrets.token_urlsafe(12), "name": name,
             "color": color, "cash": 0, "pos": 0, "jailed": False, "jail_tries": 0,
             "cards": [], "out": False}
        self.s["players"].append(p)
        self.log("{} joined".format(name), "join")
        return p

    def set_color(self, p, color):
        if self.s["phase"] != "lobby":
            raise GameError("Colours are locked once the game starts.")
        if color not in COLORS:
            raise GameError("Unknown colour.")
        if any(q["color"] == color and q["id"] != p["id"] for q in self.s["players"]):
            raise GameError("That colour is taken.")
        p["color"] = color

    def kick(self, pid):
        if self.s["phase"] != "lobby":
            raise GameError("Only in the lobby.")
        self.s["players"] = [p for p in self.s["players"] if p["id"] != pid]

    def configure(self, settings):
        if self.s["phase"] != "lobby":
            raise GameError("Settings are locked once the game starts.")
        st = self.s["settings"]
        if "start_cash" in settings:
            st["start_cash"] = max(500, min(5000, int(settings["start_cash"])))
        for k in ("free_parking", "auction"):
            if k in settings:
                st[k] = bool(settings[k])

    def start(self):
        if self.s["phase"] != "lobby":
            raise GameError("Already started.")
        ps = self.s["players"]
        if len(ps) < 2:
            raise GameError("Need at least 2 players.")
        self.rng.shuffle(ps)
        for p in ps:
            p["cash"] = self.s["settings"]["start_cash"]
        self.s["phase"] = "play"
        self.s["turn"] = 0
        self.s["stage"] = "roll"
        self.log("Game on! Order: " + ", ".join(p["name"] for p in ps), "turn")
        self.log("{}'s turn".format(ps[0]["name"]), "turn")

    # ---------- turn --------------------------------------------------
    def roll_dice(self):
        return [self.rng.randint(1, 6), self.rng.randint(1, 6)]

    def roll(self, p):
        self.need_turn(p, "roll")
        if p["jailed"]:
            return self.jail_roll(p)
        d = self.roll_dice()
        self.s["dice"] = d
        self.s["rolln"] = self.s.get("rolln", 0) + 1
        self.s["again"] = d[0] == d[1]
        self.log("{} rolled {} + {} = {}".format(p["name"], d[0], d[1], sum(d)), "roll")
        if self.s["again"]:
            self.s["dbl"] += 1
            if self.s["dbl"] == 3:
                self.log("Three doubles in a row. Speeding! Straight to jail.", "jail")
                self.go_jail(p)
                self.s["stage"] = "done"
                return
        self.move_by(p, sum(d))

    def jail_roll(self, p):
        d = self.roll_dice()
        self.s["dice"] = d
        self.s["rolln"] = self.s.get("rolln", 0) + 1
        self.s["again"] = False  # a jail-break double never rolls again
        if d[0] == d[1]:
            p["jailed"] = False
            p["jail_tries"] = 0
            self.log("{} rolled {} + {}. Doubles! Out of jail.".format(p["name"], d[0], d[1]), "roll")
            return self.move_by(p, sum(d))
        p["jail_tries"] += 1
        if p["jail_tries"] >= 3:
            self.log("{} rolled {} + {}. Third try: pays the {} fine and moves.".format(
                p["name"], d[0], d[1], peso(JAIL_FINE)), "roll")
            p["jailed"] = False
            p["jail_tries"] = 0
            self.charge(p, "bank", JAIL_FINE, "jail fine")
            return self.proceed({"k": "jailmove", "n": sum(d)})
        self.log("{} rolled {} + {}. Still in jail ({}/3).".format(p["name"], d[0], d[1], p["jail_tries"]), "roll")
        self.s["stage"] = "done"

    def jail_pay(self, p):
        self.need_turn(p, "roll")
        if not p["jailed"]:
            raise GameError("You're not in jail.")
        if p["cash"] < JAIL_FINE:
            raise GameError("You need {} cash. Mortgage something first.".format(peso(JAIL_FINE)))
        p["jailed"] = False
        p["jail_tries"] = 0
        self.charge(p, "bank", JAIL_FINE, "bail")
        self.log("{} is out of jail. Roll!".format(p["name"]), "jail")

    def jail_card(self, p):
        self.need_turn(p, "roll")
        if not p["jailed"]:
            raise GameError("You're not in jail.")
        if not p["cards"]:
            raise GameError("You have no Get Out of Jail Free card.")
        deck = p["cards"].pop()
        cards = DECKS[deck]
        ci = next(i for i, c in enumerate(cards) if c["a"] == "goojf")
        self.s["decks"][deck].append(ci)
        p["jailed"] = False
        p["jail_tries"] = 0
        self.log("{} used a Get Out of Jail Free card".format(p["name"]), "jail")

    def go_jail(self, p):
        p["pos"] = JAIL
        p["jailed"] = True
        p["jail_tries"] = 0
        self.s["again"] = False
        self.log("{} went to jail".format(p["name"]), "jail")

    def move_by(self, p, n):
        old = p["pos"]
        p["pos"] = (old + n) % 40
        if n > 0 and p["pos"] < old:
            self.credit(p, GO_SALARY, "passed GO")
        self.land(p)

    def move_to(self, p, target, special=None):
        if target < p["pos"]:
            self.credit(p, GO_SALARY, "passed GO")
        p["pos"] = target
        self.land(p, special)

    def land(self, p, special=None):
        i = p["pos"]
        sq = SQUARES[i]
        t = sq["type"]
        if t in BUYABLE:
            o = self.prop(i)
            if not o:
                self.s["stage"] = "buy"
                self.s["pending"] = {"sq": i}
                self.log("{} landed on {} ({}). Buy it?".format(p["name"], sq["name"], peso(sq["price"])), "land")
                return
            if o["owner"] == p["id"]:
                self.log("{} landed on their own {}".format(p["name"], sq["name"]), "land")
            elif o["mortgaged"]:
                self.log("{} landed on {}. It's mortgaged, no rent.".format(p["name"], sq["name"]), "land")
            else:
                rent = self.rent(i, special)
                self.charge(p, o["owner"], rent, "rent on " + sq["name"])
        elif t == "tax":
            self.charge(p, "bank", sq["amount"], sq["name"].lower())
        elif t in DECKS:
            return self.draw(p, t)
        elif t == "gotojail":
            self.go_jail(p)
        elif t == "parking" and self.s["pot"] > 0:
            pot, self.s["pot"] = self.s["pot"], 0
            self.credit(p, pot, "Free Parking jackpot")
        self.proceed({"k": "after"})

    def rent(self, i, special=None):
        sq, o = SQUARES[i], self.prop(i)
        owner = o["owner"]
        if sq["type"] == "street":
            if o["houses"]:
                return sq["rent"][o["houses"]]
            return sq["rent"][0] * (2 if self.owns_group(owner, sq["group"]) else 1)
        n = sum(1 for j in GROUP_SQ[sq["group"]] if (self.prop(j) or {}).get("owner") == owner)
        if sq["type"] == "rail":
            r = 25 * 2 ** (n - 1)
            return r * 2 if special == "rail" else r
        if special == "util":
            d = self.roll_dice()
            self.log("Utility roll: {} + {}, times 10".format(*d), "roll")
            return 10 * sum(d)
        return (4 if n == 1 else 10) * sum(self.s["dice"])

    def draw(self, p, deck):
        order = self.s["decks"][deck]
        ci = order.pop(0)
        c = DECKS[deck][ci]
        if c["a"] == "goojf":
            p["cards"].append(deck)
        else:
            order.append(ci)
        self.s["cardn"] = self.s.get("cardn", 0) + 1
        self.s["card"] = {"n": self.s["cardn"], "deck": deck, "text": c["text"], "by": p["id"]}
        self.log("{} drew {}: {}".format(p["name"], "Chance" if deck == "chance" else "Community Chest", c["text"]), "card")
        a = c["a"]
        if a == "move":
            return self.move_to(p, c["to"])
        if a == "rail" or a == "util":
            j = p["pos"]
            while SQUARES[j]["type"] != a:
                j = (j + 1) % 40
            return self.move_to(p, j, a)
        if a == "back":
            p["pos"] = (p["pos"] - 3) % 40
            return self.land(p)
        if a == "jail":
            self.go_jail(p)
        elif a == "cash":
            if c["n"] > 0:
                self.credit(p, c["n"], "card")
            else:
                self.charge(p, "bank", -c["n"], "card")
        elif a == "each":
            for q in self.active():
                if q["id"] == p["id"]:
                    continue
                if c["n"] > 0:
                    self.charge(q, p["id"], c["n"], "card")
                else:
                    self.charge(p, q["id"], -c["n"], "card")
        elif a == "repairs":
            h = H = 0
            for i in self.owned_by(p["id"]):
                n = self.prop(i)["houses"]
                if n == 5:
                    H += 1
                else:
                    h += n
            self.charge(p, "bank", h * c["h"] + H * c["H"], "repairs")
        self.proceed({"k": "after"})

    # ---------- buying / auction --------------------------------------
    def buy(self, p):
        self.need_turn(p, "buy")
        i = self.s["pending"]["sq"]
        sq = SQUARES[i]
        if p["cash"] < sq["price"]:
            raise GameError("Not enough cash for {}. Mortgage something or auction it.".format(peso(sq["price"])))
        p["cash"] -= sq["price"]
        self.s["props"][str(i)] = {"owner": p["id"], "houses": 0, "mortgaged": False}
        self.s["pending"] = None
        self.log("{} bought {} for {}".format(p["name"], sq["name"], peso(sq["price"])), "buy", {p["id"]: -sq["price"]})
        self.proceed({"k": "after"})

    def decline(self, p):
        self.need_turn(p, "buy")
        i = self.s["pending"]["sq"]
        self.s["pending"] = None
        if not self.s["settings"].get("auction", True):
            self.log("{} passed on {}".format(p["name"], SQUARES[i]["name"]), "land")
            return self.proceed({"k": "after"})
        self.s["stage"] = "auction"
        self.s["auction"] = {"sq": i, "high": 0, "by": None, "ends": self.clock() + AUCTION_OPEN_SECS,
                             "passed": []}
        self.log("Auction! {} goes to the highest bidder".format(SQUARES[i]["name"]), "auction")

    def bid(self, p, amount):
        self.need_play()
        a = self.s["auction"]
        if not a or self.s["stage"] != "auction":
            raise GameError("No auction running.")
        if p["out"]:
            raise GameError("You're out of the game.")
        amount = int(amount)
        if amount <= a["high"]:
            raise GameError("Bid more than {}.".format(peso(a["high"])))
        if amount > p["cash"]:
            raise GameError("You only have {}.".format(peso(p["cash"])))
        a["high"], a["by"] = amount, p["id"]
        a["ends"] = max(a["ends"], self.clock() + AUCTION_BID_SECS)
        if p["id"] in a["passed"]:
            a["passed"].remove(p["id"])
        self.log("{} bids {}".format(p["name"], peso(amount)), "auction")
        self.auction_check()

    def auction_pass(self, p):
        self.need_play()
        a = self.s["auction"]
        if not a:
            raise GameError("No auction running.")
        if p["id"] == a["by"]:
            raise GameError("You're the top bidder.")
        if p["id"] not in a["passed"]:
            a["passed"].append(p["id"])
        self.auction_check()

    def auction_check(self):
        a = self.s["auction"]
        left = [q for q in self.active() if q["id"] not in a["passed"] and q["id"] != a["by"]]
        if not left:
            self.auction_end()

    def auction_end(self):
        a = self.s["auction"]
        sq = SQUARES[a["sq"]]
        self.s["auction"] = None
        if a["by"]:
            w = self.player(a["by"])
            w["cash"] -= a["high"]
            self.s["props"][str(a["sq"])] = {"owner": w["id"], "houses": 0, "mortgaged": False}
            self.log("{} won {} for {}".format(w["name"], sq["name"], peso(a["high"])), "buy", {w["id"]: -a["high"]})
        else:
            self.log("No bids. {} stays with the bank.".format(sq["name"]), "auction")
        self.proceed({"k": "after"})

    def tick(self):
        """Called a few times a second; returns True if anything changed."""
        a = self.s["auction"]
        if self.s["phase"] == "play" and a and self.clock() >= a["ends"]:
            self.auction_end()
            return True
        return False

    def end_turn(self, p):
        self.need_turn(p, "done")
        self.next_turn()

    def next_turn(self):
        if self.check_over():
            return
        ps = self.s["players"]
        t = self.s["turn"]
        for _ in range(len(ps)):
            t = (t + 1) % len(ps)
            if not ps[t]["out"]:
                break
        self.s["turn"] = t
        self.s["dbl"] = 0
        self.s["again"] = False
        self.s["stage"] = "roll"
        self.s["pending"] = None
        p = ps[t]
        self.log("{}'s turn{}".format(p["name"], " (in jail)" if p["jailed"] else ""), "turn")

    # ---------- buildings / mortgage ----------------------------------
    def _mine(self, p, i):
        self.need_play()
        if p["out"]:
            raise GameError("You're out of the game.")
        o = self.prop(i)
        if not o or o["owner"] != p["id"]:
            raise GameError("That's not yours.")
        return SQUARES[i], o

    def build(self, p, i):
        sq, o = self._mine(p, i)
        if self.my_debts(p):
            raise GameError("Pay your debt first.")
        if sq["type"] != "street":
            raise GameError("You can only build on streets.")
        g = GROUP_SQ[sq["group"]]
        if not self.owns_group(p["id"], sq["group"]):
            raise GameError("You need the whole colour set first.")
        if any(self.prop(j)["mortgaged"] for j in g):
            raise GameError("Unmortgage the set first.")
        if o["houses"] >= 5:
            raise GameError("Already has a hotel.")
        if o["houses"] > min(self.prop(j)["houses"] for j in g):
            raise GameError("Build evenly: add to the other streets in the set first.")
        if self.spendable(p) < sq["house"]:
            raise GameError("A house here costs {}.".format(peso(sq["house"])))
        if o["houses"] == 4:
            if self.s["hotels"] < 1:
                raise GameError("The bank is out of hotels.")
            self.s["hotels"] -= 1
            self.s["houses"] += 4
        else:
            if self.s["houses"] < 1:
                raise GameError("The bank is out of houses.")
            self.s["houses"] -= 1
        o["houses"] += 1
        p["cash"] -= sq["house"]
        what = "a hotel" if o["houses"] == 5 else "house #{}".format(o["houses"])
        self.log("{} built {} on {}".format(p["name"], what, sq["name"]), "build", {p["id"]: -sq["house"]})

    def sell_house(self, p, i):
        sq, o = self._mine(p, i)
        if sq["type"] != "street" or o["houses"] == 0:
            raise GameError("No houses there.")
        if o["houses"] < max(self.prop(j)["houses"] for j in GROUP_SQ[sq["group"]]):
            raise GameError("Sell evenly: sell from the other streets in the set first.")
        if o["houses"] == 5:
            if self.s["houses"] < 4:
                raise GameError("The bank doesn't have 4 houses to swap for your hotel.")
            self.s["houses"] -= 4
            self.s["hotels"] += 1
        else:
            self.s["houses"] += 1
        o["houses"] -= 1
        back = sq["house"] // 2
        p["cash"] += back
        self.log("{} sold a building on {} for {}".format(p["name"], sq["name"], peso(back)), "sell", {p["id"]: back})
        self.settle(p)

    def mortgage(self, p, i):
        sq, o = self._mine(p, i)
        if o["mortgaged"]:
            raise GameError("Already mortgaged.")
        if self.group_has_houses(sq["group"]):
            raise GameError("Sell the houses in this set first.")
        o["mortgaged"] = True
        v = sq["price"] // 2
        p["cash"] += v
        self.log("{} mortgaged {} for {}".format(p["name"], sq["name"], peso(v)), "sell", {p["id"]: v})
        self.settle(p)

    def unmortgage(self, p, i):
        sq, o = self._mine(p, i)
        if not o["mortgaged"]:
            raise GameError("Not mortgaged.")
        if self.my_debts(p):
            raise GameError("Pay your debt first.")
        cost = unmortgage_cost(i)
        if self.spendable(p) < cost:
            raise GameError("Unmortgaging costs {}.".format(peso(cost)))
        o["mortgaged"] = False
        p["cash"] -= cost
        self.log("{} unmortgaged {} for {}".format(p["name"], sq["name"], peso(cost)), "buy", {p["id"]: -cost})

    # ---------- bankruptcy --------------------------------------------
    def bankrupt(self, p):
        self.need_play()
        mine = self.my_debts(p)
        if not mine:
            raise GameError("You don't owe anything.")
        creditors = {d["to"] for d in mine}
        to = creditors.pop() if len(creditors) == 1 else "bank"
        if to != "bank" and self.player(to)["out"]:
            to = "bank"
        # buildings go back to the bank at half price
        for i in self.owned_by(p["id"]):
            sq, o = SQUARES[i], self.prop(i)
            if o["houses"]:
                if o["houses"] == 5:
                    self.s["hotels"] += 1
                else:
                    self.s["houses"] += o["houses"]
                p["cash"] += o["houses"] * sq["house"] // 2
                o["houses"] = 0
        self.s["debts"] = [d for d in self.s["debts"] if d["from"] != p["id"]]
        # anyone who owed p now owes the bank
        for d in self.s["debts"]:
            if d["to"] == p["id"]:
                d["to"] = "bank"
        if to == "bank":
            for i in self.owned_by(p["id"]):
                del self.s["props"][str(i)]
            for deck in p["cards"]:
                ci = next(k for k, c in enumerate(DECKS[deck]) if c["a"] == "goojf")
                self.s["decks"][deck].append(ci)
            self.log("{} is bankrupt. Everything goes back to the bank.".format(p["name"]), "out", {p["id"]: -p["cash"]})
        else:
            w = self.player(to)
            for i in self.owned_by(p["id"]):
                self.prop(i)["owner"] = w["id"]
            w["cash"] += p["cash"]
            w["cards"] += p["cards"]
            self.log("{} is bankrupt. {} takes everything ({} cash + properties).".format(
                p["name"], w["name"], peso(p["cash"])), "out", {p["id"]: -p["cash"], w["id"]: p["cash"]})
        p["cash"] = 0
        p["cards"] = []
        p["out"] = True
        p["jailed"] = False
        self.s["trades"] = [t for t in self.s["trades"] if p["id"] not in (t["from"], t["to"])]
        a = self.s["auction"]
        if a:
            if a["by"] == p["id"]:
                a["high"], a["by"] = 0, None
            self.auction_check() if self.s["auction"] else None
        if self.check_over():
            return
        if self.s["stage"] == "debt":
            self.settle()
        elif self.cur()["out"] and self.s["stage"] in ("roll", "done"):
            self.next_turn()

    def check_over(self):
        act = self.active()
        if self.s["phase"] == "play" and len(act) <= 1:
            self.finish(act[0]["id"] if act else None)
            return True
        return False

    def finish(self, winner=None):
        ranked = sorted(self.s["players"], key=lambda q: (not q["out"], self.net_worth(q)), reverse=True)
        self.s["phase"] = "over"
        self.s["stage"] = "idle"
        self.s["auction"] = None
        self.s["winner"] = winner or ranked[0]["id"]
        self.log("Game over! {} wins.".format(self.name(self.s["winner"])), "over")

    # ---------- trades ------------------------------------------------
    def _check_side(self, p, props, cash):
        for i in props:
            o = self.prop(i)
            if not o or o["owner"] != p["id"]:
                raise GameError("{} doesn't own {}.".format(p["name"], SQUARES[i]["name"]))
            if self.group_has_houses(SQUARES[i]["group"]):
                raise GameError("Sell the houses on the {} set before trading it.".format(SQUARES[i]["name"]))
        if cash < 0:
            raise GameError("Cash can't be negative.")
        if cash > self.spendable(p):
            raise GameError("{} only has {} to spare.".format(p["name"], peso(self.spendable(p))))

    def propose(self, p, to, give, give_cash, get, get_cash):
        self.need_play()
        q = self.player(to)
        if p["out"] or q["out"] or q["id"] == p["id"]:
            raise GameError("Pick another player.")
        give = sorted({int(i) for i in give})
        get = sorted({int(i) for i in get})
        give_cash, get_cash = int(give_cash or 0), int(get_cash or 0)
        if not (give or get or give_cash or get_cash):
            raise GameError("The offer is empty.")
        self._check_side(p, give, give_cash)
        self._check_side(q, get, 0)
        if get_cash < 0:
            raise GameError("Cash can't be negative.")
        if len([t for t in self.s["trades"] if t["from"] == p["id"]]) >= 3:
            raise GameError("You already have 3 offers out.")
        t = {"id": secrets.token_hex(3), "from": p["id"], "to": q["id"], "give": give,
             "give_cash": give_cash, "get": get, "get_cash": get_cash}
        self.s["trades"].append(t)
        self.log("{} sent {} a trade offer".format(p["name"], q["name"]), "trade")
        return t

    def _trade(self, tid):
        for t in self.s["trades"]:
            if t["id"] == tid:
                return t
        raise GameError("That offer is gone.")

    def respond(self, q, tid, accept):
        self.need_play()
        t = self._trade(tid)
        if t["to"] != q["id"]:
            raise GameError("That offer isn't for you.")
        p = self.player(t["from"])
        if not accept:
            self.s["trades"].remove(t)
            self.log("{} declined {}'s offer".format(q["name"], p["name"]), "trade")
            return
        self._check_side(p, t["give"], t["give_cash"])
        self._check_side(q, t["get"], t["get_cash"])
        self.s["trades"].remove(t)
        for i in t["give"]:
            self.prop(i)["owner"] = q["id"]
        for i in t["get"]:
            self.prop(i)["owner"] = p["id"]
        p["cash"] += t["get_cash"] - t["give_cash"]
        q["cash"] += t["give_cash"] - t["get_cash"]
        net = t["get_cash"] - t["give_cash"]
        parts = []
        if t["give"] or t["give_cash"]:
            parts.append("{} gave {}".format(p["name"], ", ".join(
                [SQUARES[i]["name"] for i in t["give"]] + ([peso(t["give_cash"])] if t["give_cash"] else []))))
        if t["get"] or t["get_cash"]:
            parts.append("{} gave {}".format(q["name"], ", ".join(
                [SQUARES[i]["name"] for i in t["get"]] + ([peso(t["get_cash"])] if t["get_cash"] else []))))
        self.log("Trade done: " + "; ".join(parts), "trade", {p["id"]: net, q["id"]: -net} if net else {})
        # offers that relied on what just moved are void now
        moved = set(t["give"]) | set(t["get"])
        self.s["trades"] = [x for x in self.s["trades"] if not (moved & (set(x["give"]) | set(x["get"])))]
        self.settle()

    def cancel_trade(self, p, tid):
        t = self._trade(tid)
        if t["from"] != p["id"]:
            raise GameError("Not your offer.")
        self.s["trades"].remove(t)

    # ---------- views -------------------------------------------------
    def public(self):
        s = self.s
        players = []
        for p in s["players"]:
            q = {k: v for k, v in p.items() if k != "secret"}
            q["worth"] = self.net_worth(p)
            players.append(q)
        out = {k: v for k, v in s.items() if k not in ("players", "decks")}
        out["players"] = players
        if s["auction"]:
            out["auction"] = dict(s["auction"], left=max(0, round(s["auction"]["ends"] - self.clock(), 1)))
        return out
