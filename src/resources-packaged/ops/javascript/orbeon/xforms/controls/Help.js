/**
 * Copyright (C) 2013 Orbeon, Inc.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the
 * GNU Lesser General Public License as published by the Free Software Foundation; either version
 * 2.1 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Lesser General Public License for more details.
 *
 * The full text of the license is available at http://www.gnu.org/copyleft/lesser.html
 */

(function() {

    var Controls = ORBEON.xforms.Controls;

    /**
     * We're asked to show the help popover for a control, either because the user clicked on the help icon,
     * or because the server asks us to do so.
     *
     * [1] We want the arrow to point to the form field, not somewhere between the label and the field,
     *     hence here we look for the first element which is not an LHHA. If we don't find any such element
     *     we use the container as a fallback (e.g. xf:group that only contains the help and a label).
     * [2] Using animation unnecessarily complicates things, by creating cases where we have two popovers
     *     in the DOM, when one is being hidden while the other is being shown, so we just disable animations.
     */
    Controls.showHelp = function(controlEl) {

        controlEl = $(controlEl);
        var labelText           = Controls.getLabelMessage(controlEl[0]);
        var helpText            = Controls.getHelpMessage (controlEl[0]);
        var firstChildFormEl    = controlEl.find(':input').first();
        var el                  = firstChildFormEl.is('*') ? firstChildFormEl : controlEl; // [1]
        var elPos               = getPosition(el);
        var placement           = getPlacement(elPos);
        var popoverAlreadyShown = controlEl.next().is('.xforms-help-popover');

        // Hide other help popovers before (maybe) showing this one
        hideAllHelpPopovers();

        // We take users asking to show the popover when already shown as an order to hide it
        if (! popoverAlreadyShown) {

            // For top placement, popover must be above the label
            if (placement == 'top') {
                el = controlEl;
                elPos = getPosition(el);
            }

            controlEl.popover({
                placement: placement,
                trigger:   'manual',
                title:     labelText,
                content:   helpText,
                html:      true,
                animation: false // [2]
            }).popover('show');


            // Decorate an position popover
            var popover = $(controlEl).next();
            popover.addClass('xforms-help-popover');
            addClose(controlEl, popover);
            positionPopover(popover, placement, elPos);
        }
    };

    function hideAllHelpPopovers() {
        _.each($('form.xforms-form .xforms-help-popover'), function(popover) {
            $(popover).prev().popover('destroy');
        });
    }

    /**
     * Get offset/width/height of element, dealing with case where element is inline
     */
    function getPosition(el) {
        function getElPosition() {
            return {
                offset:    el.offset(),
                width :    el.outerWidth(),
                height:    el.outerHeight(),
                scrollTop: $(document).scrollTop() // Will this work if we're in a scrollable area?
            }
        }

        var pos;
        if (el.is(':hidden')) {
            var originalStyle = el.attr('style');
            el.css('display', 'inline-block');
            pos = getElPosition();
            (_.isUndefined(originalStyle))
                ? el.removeAttr('style')
                : el.attr('style', originalStyle);
        } else {
            pos = getElPosition();
        }

        var overflowEl = $(_.find($(el).parents(), function(e) { return $(e).css('overflow') == 'auto'; }));
        var overflowPos = {};
        pos.margins = ! overflowEl.is('*')
            ? { top: 0, right: 0, bottom: 0, left: 0 }
            : (
                overflowPos.offset = overflowEl.offset(),
                overflowPos.width  = overflowEl.outerWidth(),
                overflowPos.height = overflowEl.outerHeight(),
                {
                    top:    overflowPos.offset.top,
                    right:  $(window).width()  - overflowPos.offset.left - overflowPos.width,
                    bottom: $(window).height() - overflowPos.offset.top  - overflowPos.height,
                    left:   overflowPos.offset.left
                }
              );

        return pos;
    }

    /**
     * Figure where we want to place the popover: right, left, top, bottom, or over
     */
    function getPlacement(elPos) {
        var RequiredSpaceHorizontal = 420;
        var RequiredSpaceVertical   = 300;
        var space = {
            left:   elPos.offset.left,
            right:  $(window).width() - (elPos.offset.left + elPos.width),
            top:    elPos.offset.top - elPos.scrollTop,
            bottom: $(window).height() - (elPos.offset.top - elPos.scrollTop + elPos.height)
        };
        return (space.right >= RequiredSpaceHorizontal || space.left >= RequiredSpaceHorizontal)
             ?  space.right >= space.left ? 'right' : 'left'
             : (space.top   >= RequiredSpaceVertical || space.bottom >= RequiredSpaceVertical)
             ?  space.top   >= space.bottom ? 'top' : 'bottom'
             : 'over';
    }

    /**
     * Adds an "x" at the top right of the popover, so users can close it with a click
     */
    function addClose(controlEl, popover) {
        if (! popover.children('.close').is('*')) {
            var close = $('<button type="button" class="close" data-dismiss="modal" aria-hidden="true">×</button>');
            popover.prepend(close);
            close.on('click', function() { controlEl.popover('destroy'); });
        }
    }

    /**
     * We re-implement the positioning and sizing done by Bootstrap. Instead of indirectly positioning
     * the popover by setting CSS properties on its container, we let Bootstrap give its best shot at
     * positioning and sizing, and we then adjust what Bootstrap did. Bootstrap code is in:
     * https://github.com/twbs/bootstrap/blob/v2.3.2/js/bootstrap-tooltip.js
     *
     * [1] It is unclear to my why we need to add the arrow width, as it should be counted in the width
     *     of the popover, which has a margin to reserve space for the arrow.
     * [2] Bootstrap already positioned the popover mostly correctly, but since we can reduced its
     *     height, in case we do this might remove the need to a scrollbar, which changes the right offset
     *     of the control (e.g. when they are centered), and consequently the right offset of the popover
     *     also needs to be adjusted.
     */
    function positionPopover(popover, placement, elPos) {
        var padding       = 20; // Space left between popover and document border
        var arrowWidth    = popover.children('.arrow').outerWidth(); // [1]
        var arrowHeight   = popover.children('.arrow').outerHeight();

        // Constraint height if taller than viewport
        var maxHeight =
            // When left/right, viewport height sets the limit
            _.contains(['right', 'left', 'over'], placement) ?
                $(window).height() - 2*padding - elPos.margins.top - elPos.margins.bottom
            // When bottom, space below
            : placement == 'bottom' ?
                $(window).height() - (elPos.offset.top - elPos.scrollTop + elPos.height + arrowHeight + padding)
            // When top, space above
            : elPos.offset.top - elPos.scrollTop - padding - arrowHeight;
        if (popover.outerHeight() > maxHeight) {
            var title   = popover.children('.popover-title');
            var content = popover.children('.popover-content');
            popover.css('height', maxHeight + 'px');
            content.css('height', (maxHeight - title.outerHeight()) + 'px');
        }

        // Adjust position
        var popoverOffset = popover.offset();
        popoverOffset.top = (function() {
            switch (true) {
                case _.contains(['right', 'left'], placement) && (popoverOffset.top - elPos.scrollTop < padding):
                    return elPos.margins.top + elPos.scrollTop + padding;
                case placement == 'top':
                    return elPos.offset.top - popover.outerHeight() - arrowHeight;
                case placement == 'over':
                    return elPos.offset.top + padding;
                default:
                    return popoverOffset.top;
            }
        })();
        popoverOffset.left = (function() {
            switch (true) {
                case placement == 'right':
                    return elPos.offset.left + elPos.width + arrowWidth
                case placement == 'left':
                    return elPos.offset.left - popover.outerWidth() - arrowWidth
                case _.contains(['top', 'bottom'], placement):
                    return elPos.offset.left
                case placement == 'over':
                    return elPos.offset.left + elPos.width - popover.outerWidth() - padding;
                default:
                    return popoverOffset.top;
            }
        })();
        popover.offset(popoverOffset);

        // Adjust arrow height for right/left
        if (_.contains(['right', 'left'], placement)) {
            var controlTopDoc = elPos.offset.top + elPos.height/2;
            var controlTopPopover = controlTopDoc - popoverOffset.top;
            var arrowTop = (controlTopPopover / popover.outerHeight()) * 100;
            popover.children('.arrow').css('top', arrowTop + '%');
        } else if (_.contains(['top', 'bottom'], placement)) {
            popover.children('.arrow').css('left', '10%');
        }
    }

    // Hide help when users press the escape key
    $(document).keyup(function(e) {
        if (e.keyCode == 27) { hideAllHelpPopovers(); }
    });
})();