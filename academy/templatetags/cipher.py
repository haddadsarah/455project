from django import template

register = template.Library()


@register.filter
def item(mapping, key):
    return mapping[key]


@register.filter
def binary(hex_value):
    return f"{int(hex_value, 16):0{4 * len(hex_value)}b}"
